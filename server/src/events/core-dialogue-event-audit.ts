import {
  CORE_DIALOGUE_EVENT_VERSION,
  coreDialogueEventSchemas,
  coreDialogueMinimumEventNames,
  type CoreDialogueEventName,
} from "./core-dialogue-events.js";

export interface StoredCoreDialogueEvent {
  id: string;
  eventKey: string | null;
  eventType: string;
  eventVersion: string;
  metadataJson: unknown;
  occurredAt: Date;
  isReplay: boolean;
}

export interface CoreDialogueEventAuditReport {
  schemaVersion: "core-dialogue-event-audit-v2";
  generatedAt: string;
  status: "passed" | "failed";
  totalRows: number;
  auditedRows: number;
  legacyRows: number;
  replayRows: number;
  duplicateEventKeys: string[];
  invalidEvents: Array<{ id: string; eventType: string; reason: string }>;
  countsByEvent: Record<string, number>;
  minimumCoverage: Record<typeof coreDialogueMinimumEventNames[number], "observed" | "not_observed">;
  notes: string[];
}

export function auditCoreDialogueEvents(events: StoredCoreDialogueEvent[], now = new Date()): CoreDialogueEventAuditReport {
  const current = events.filter((event) => event.eventVersion === CORE_DIALOGUE_EVENT_VERSION);
  const legacy = events.filter((event) => event.eventVersion !== CORE_DIALOGUE_EVENT_VERSION);
  const keys = current.flatMap((event) => event.eventKey ? [event.eventKey] : []);
  const duplicateEventKeys = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))].sort();
  const invalidEvents: CoreDialogueEventAuditReport["invalidEvents"] = [];
  const countsByEvent: Record<string, number> = {};
  for (const event of current) {
    countsByEvent[event.eventType] = (countsByEvent[event.eventType] ?? 0) + 1;
    if (!event.eventKey) {
      invalidEvents.push({ id: event.id, eventType: event.eventType, reason: "缺少 eventKey" });
      continue;
    }
    const schema = coreDialogueEventSchemas[event.eventType as CoreDialogueEventName];
    if (!schema) {
      invalidEvents.push({ id: event.id, eventType: event.eventType, reason: "未知 eventType" });
      continue;
    }
    const parsed = schema.safeParse(event.metadataJson);
    if (!parsed.success) {
      invalidEvents.push({ id: event.id, eventType: event.eventType, reason: parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ") });
    }
    if (event.occurredAt.getTime() > now.getTime() + 60_000) {
      invalidEvents.push({ id: event.id, eventType: event.eventType, reason: "occurredAt 位于未来" });
    }
  }
  const minimumCoverage = Object.fromEntries(coreDialogueMinimumEventNames.map((name) => [name, countsByEvent[name] ? "observed" : "not_observed"])) as CoreDialogueEventAuditReport["minimumCoverage"];
  const notes = [
    "未观察到某个最小事件不等于实现失败；它可能只是审计窗口内没有对应用户路径。",
    "事件审计只验证事件质量与覆盖，不计算产品北极星或自动发布门禁。",
    "回访五级状态已进入 event-v2；task_type 仍未进入生产事件。",
  ];
  return {
    schemaVersion: "core-dialogue-event-audit-v2",
    generatedAt: now.toISOString(),
    status: duplicateEventKeys.length || invalidEvents.length ? "failed" : "passed",
    totalRows: events.length,
    auditedRows: current.length,
    legacyRows: legacy.length,
    replayRows: current.filter((event) => event.isReplay).length,
    duplicateEventKeys,
    invalidEvents,
    countsByEvent,
    minimumCoverage,
    notes,
  };
}

export function renderCoreDialogueEventAuditMarkdown(report: CoreDialogueEventAuditReport): string {
  return [
    "# Core Dialogue Event v2 审计报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 状态：**${report.status}**`,
    `- 当前版本事件：${report.auditedRows}`,
    `- 历史事件：${report.legacyRows}`,
    `- replay 事件：${report.replayRows}`,
    "",
    "## 最小事件覆盖",
    "",
    "| 事件 | 状态 | 数量 |",
    "| --- | --- | ---: |",
    ...Object.entries(report.minimumCoverage).map(([name, status]) => `| ${name} | ${status} | ${report.countsByEvent[name] ?? 0} |`),
    "",
    "## 无效事件",
    "",
    ...(report.invalidEvents.length ? report.invalidEvents.map((event) => `- ${event.id} ${event.eventType}：${event.reason}`) : ["无"]),
    "",
    "## 重复幂等键",
    "",
    ...(report.duplicateEventKeys.length ? report.duplicateEventKeys.map((key) => `- ${key}`) : ["无"]),
    "",
    "## 说明",
    "",
    ...report.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}
