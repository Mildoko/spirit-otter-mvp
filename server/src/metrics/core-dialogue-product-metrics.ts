import { CORE_DIALOGUE_EVENT_VERSION, coreDialogueEventSchemas, type CoreDialogueEventName } from "../events/core-dialogue-events.js";

export type ProductMetricAvailability = "measurable" | "proxy_observational" | "not_measurable";

export interface ProductMetricResult {
  metricId: string;
  name: string;
  availability: ProductMetricAvailability;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  note: string;
}

export interface ProductMetricEvent {
  id: string;
  eventType: string;
  eventVersion: string;
  metadataJson: unknown;
  occurredAt: Date;
}

export interface CoreDialogueProductMetricsReport {
  schemaVersion: "core-dialogue-product-metrics-v1";
  generatedAt: string;
  eventVersion: typeof CORE_DIALOGUE_EVENT_VERSION;
  status: "valid" | "invalid";
  invalidReasons: string[];
  auditedEvents: number;
  metrics: ProductMetricResult[];
  outcomeDistribution: Record<"not_started" | "partial_progress" | "completed" | "blocked" | "redefined", number>;
  releaseDecision: "not_determined";
  notes: string[];
}

interface ValidEvent { eventType: CoreDialogueEventName; metadata: Record<string, unknown>; occurredAt: Date }

function ratio(metricId: string, name: string, availability: ProductMetricAvailability, numerator: number, denominator: number, note: string): ProductMetricResult {
  return { metricId, name, availability, numerator, denominator, rate: denominator > 0 ? numerator / denominator : null, note };
}

function uniqueIds(events: ValidEvent[], eventType: CoreDialogueEventName, field: string): Set<string> {
  return new Set(events.filter((event) => event.eventType === eventType).flatMap((event) => typeof event.metadata[field] === "string" ? [String(event.metadata[field])] : []));
}

export function calculateCoreDialogueProductMetrics(events: ProductMetricEvent[], now = new Date()): CoreDialogueProductMetricsReport {
  const current = events.filter((event) => event.eventVersion === CORE_DIALOGUE_EVENT_VERSION);
  const invalidReasons: string[] = [];
  const valid: ValidEvent[] = [];
  for (const event of current) {
    const schema = coreDialogueEventSchemas[event.eventType as CoreDialogueEventName];
    if (!schema) {
      invalidReasons.push(`${event.id}: unknown eventType ${event.eventType}`);
      continue;
    }
    const parsed = schema.safeParse(event.metadataJson);
    if (!parsed.success) {
      invalidReasons.push(`${event.id}: invalid metadata`);
      continue;
    }
    valid.push({ eventType: event.eventType as CoreDialogueEventName, metadata: parsed.data as Record<string, unknown>, occurredAt: event.occurredAt });
  }
  if (current.length === 0) invalidReasons.push(`没有 ${CORE_DIALOGUE_EVENT_VERSION} 事件，不能形成产品指标报告`);

  const generatedActions = uniqueIds(valid, "action_generated", "actionId");
  const confirmedActions = uniqueIds(valid, "action_confirmed", "actionId");
  const lowBurdenGenerated = new Set(valid.filter((event) => event.eventType === "action_generated"
    && event.metadata.isSingleAction === true
    && event.metadata.estimatedStartBucket !== "over_15m"
    && event.metadata.estimatedStartBucket !== "unknown")
    .map((event) => String(event.metadata.actionId)));
  const lowBurdenConfirmed = new Set([...confirmedActions].filter((id) => lowBurdenGenerated.has(id)));
  const reenteredFollowups = uniqueIds(valid, "followup_reentered", "followupId");
  const labelEvents = valid.filter((event) => event.eventType === "followup_state_labeled")
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  const latestLabels = new Map<string, string>();
  for (const event of labelEvents) latestLabels.set(String(event.metadata.followupId), String(event.metadata.state));
  const labeledReentries = new Set([...latestLabels.keys()].filter((id) => reenteredFollowups.has(id)));
  const outcomeDistribution = { not_started: 0, partial_progress: 0, completed: 0, blocked: 0, redefined: 0 };
  for (const state of latestLabels.values()) if (state in outcomeDistribution) outcomeDistribution[state as keyof typeof outcomeDistribution] += 1;
  const meaningfulProgress = outcomeDistribution.partial_progress + outcomeDistribution.completed + outcomeDistribution.redefined;
  const sessions = new Map<string, number>();
  for (const event of valid.filter((item) => item.eventType === "user_turn_submitted")) {
    const sessionId = String(event.metadata.sessionId);
    sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1);
  }

  return {
    schemaVersion: "core-dialogue-product-metrics-v1",
    generatedAt: now.toISOString(),
    eventVersion: CORE_DIALOGUE_EVENT_VERSION,
    status: invalidReasons.length ? "invalid" : "valid",
    invalidReasons,
    auditedEvents: current.length,
    metrics: [
      ratio("fsa_v1", "Follow-up State Assignment Validity", "measurable", labelEvents.length, labelEvents.length, "只验证用户选择被合法、幂等地写入；不冒充自由文本语义分类准确率"),
      ratio("followup_state_coverage_v1", "Follow-up State Coverage", "measurable", labeledReentries.size, reenteredFollowups.size, "到期回访中获得用户结果标签的比例"),
      ratio("mpr_proxy_v1", "Meaningful Progress Proxy", "proxy_observational", meaningfulProgress, latestLabels.size, "部分推进、完成或主动重新定义计为选择权/推进代理；必须结合人工反馈"),
      ratio("aar_v1", "Action Acceptance Rate", "measurable", confirmedActions.size, generatedActions.size, "用户确认行动 / 系统生成行动"),
      ratio("lbaar_v1", "Low-Burden Action Acceptance Rate", "proxy_observational", lowBurdenConfirmed.size, lowBurdenGenerated.size, "低负担由单一结构与预计开始时长代理，不能替代人工低负担判断"),
      ratio("frr_v1", "Follow-up Re-engagement Rate", "measurable", labeledReentries.size, reenteredFollowups.size, "用户对已展示到期回访给出任一状态"),
      ratio("ccr_v1", "Conversation Continuation Rate", "proxy_observational", [...sessions.values()].filter((count) => count >= 2).length, sessions.size, "同一 session 至少提交两轮；不解释为满意度"),
      { metricId: "sar_v1", name: "Support Acceptance Rate", availability: "not_measurable", numerator: null, denominator: null, rate: null, note: "缺少用户明确的支持接受/拒绝反馈" },
      { metricId: "tta_v1", name: "Task Type Accuracy", availability: "not_measurable", numerator: null, denominator: null, rate: null, note: "生产链路仍没有显式 task_type 金标" },
    ],
    outcomeDistribution,
    releaseDecision: "not_determined",
    notes: [
      "本报告只使用服务端结构化事件，不读取对话正文或行动文本。",
      "代理指标不得作为核心体验改善或发布通过的单独证据。",
      "不计算综合北极星分数；样本量与受控研究上下文必须与报告一并解释。",
    ],
  };
}

export function renderCoreDialogueProductMetricsMarkdown(report: CoreDialogueProductMetricsReport): string {
  const percent = (rate: number | null) => rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`;
  return [
    "# Core Dialogue Product Metrics v1",
    "",
    `- 状态：**${report.status}**`,
    `- 事件版本：${report.eventVersion}`,
    `- 审计事件：${report.auditedEvents}`,
    `- 发布结论：${report.releaseDecision}`,
    "",
    "| 指标 | 可测性 | 分子 / 分母 | 数值 | 说明 |",
    "| --- | --- | ---: | ---: | --- |",
    ...report.metrics.map((metric) => `| ${metric.metricId} ${metric.name} | ${metric.availability} | ${metric.numerator ?? "N/A"} / ${metric.denominator ?? "N/A"} | ${percent(metric.rate)} | ${metric.note} |`),
    "",
    "## 回访结果分布",
    "",
    ...Object.entries(report.outcomeDistribution).map(([state, count]) => `- ${state}: ${count}`),
    "",
    "## 无效原因",
    "",
    ...(report.invalidReasons.length ? report.invalidReasons.map((reason) => `- ${reason}`) : ["无"]),
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}
