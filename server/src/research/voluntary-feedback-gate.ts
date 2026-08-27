import { CORE_DIALOGUE_EVENT_VERSION, coreDialogueEventSchemas } from "../events/core-dialogue-events.js";
import type { ProductMetricEvent } from "../metrics/core-dialogue-product-metrics.js";
import { z } from "zod";
import type { EvidenceProvenanceV1 } from "../release/evidence-integrity.js";

export interface ResearchSafetyReviewV1 {
  schemaVersion: "research-safety-review-v1";
  status: "completed" | "not_reviewed";
  seriousIncidentCount: number;
  reviewedBy: string[];
  reviewedAt: string | null;
}

export const researchSafetyReviewSchema = z.object({
  schemaVersion: z.literal("research-safety-review-v1"),
  status: z.enum(["completed", "not_reviewed"]),
  seriousIncidentCount: z.number().int().nonnegative(),
  reviewedBy: z.array(z.string().min(1)),
  reviewedAt: z.string().datetime().nullable(),
}).strict();

export interface VoluntaryFeedbackGateReportV1 {
  schemaVersion: "voluntary-feedback-gate-v1";
  generatedAt: string;
  status: "passed" | "pending" | "blocked" | "invalid";
  completedSegments: number;
  incompleteSubmissions: number;
  thresholds: {
    minimumCompletedSegments: 50;
    understandingHitOrPartlyMinimum: 0.75;
    positiveMovementMinimum: 0.6;
    worseMaximum: 0.05;
    tooAnalyticalMaximum: 0.1;
  };
  observed: {
    understandingHitOrPartlyRate: number | null;
    positiveMovementRate: number | null;
    worseRate: number | null;
    tooAnalyticalRate: number | null;
    seriousIncidentCount: number | null;
  };
  safetyReviewStatus: ResearchSafetyReviewV1["status"];
  reasons: string[];
  invalidReasons: string[];
  privacy: "structured_metadata_only";
  provenance?: EvidenceProvenanceV1;
}

const positiveMovements = new Set(["more_space", "clearer", "more_choice"]);

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function evaluateVoluntaryFeedbackGate(input: {
  events: ProductMetricEvent[];
  safetyReview?: ResearchSafetyReviewV1;
  now?: Date;
  provenance?: EvidenceProvenanceV1;
}): VoluntaryFeedbackGateReportV1 {
  const invalidReasons: string[] = [];
  const latestBySegment = new Map<string, { occurredAt: Date; metadata: Record<string, unknown> }>();
  let incompleteSubmissions = 0;

  for (const event of input.events.filter((item) => item.eventVersion === CORE_DIALOGUE_EVENT_VERSION && item.eventType === "conversation_feedback_submitted")) {
    const parsed = coreDialogueEventSchemas.conversation_feedback_submitted.safeParse(event.metadataJson);
    if (!parsed.success) {
      invalidReasons.push(`${event.id}: invalid conversation feedback metadata`);
      continue;
    }
    if (parsed.data.feedbackSchemaVersion !== 2 || parsed.data.understanding === null || parsed.data.movement === null) {
      incompleteSubmissions += 1;
      continue;
    }
    const current = latestBySegment.get(parsed.data.segmentId);
    if (!current || current.occurredAt <= event.occurredAt) {
      latestBySegment.set(parsed.data.segmentId, { occurredAt: event.occurredAt, metadata: parsed.data });
    }
  }

  const completed = [...latestBySegment.values()].map((item) => item.metadata);
  const denominator = completed.length;
  const understandingRate = rate(completed.filter((item) => item.understanding === "hit" || item.understanding === "partly").length, denominator);
  const positiveMovementRate = rate(completed.filter((item) => positiveMovements.has(String(item.movement))).length, denominator);
  const worseRate = rate(completed.filter((item) => item.movement === "worse").length, denominator);
  const tooAnalyticalRate = rate(completed.filter((item) => item.reason === "too_analytical").length, denominator);
  const defaultSafetyReview: ResearchSafetyReviewV1 = {
    schemaVersion: "research-safety-review-v1" as const,
    status: "not_reviewed" as const,
    seriousIncidentCount: 0,
    reviewedBy: [],
    reviewedAt: null,
  };
  const parsedSafetyReview = researchSafetyReviewSchema.safeParse(input.safetyReview ?? defaultSafetyReview);
  const safetyReview = parsedSafetyReview.success ? parsedSafetyReview.data : defaultSafetyReview;
  if (!parsedSafetyReview.success) invalidReasons.push("invalid research safety review metadata");
  if (safetyReview.status === "completed" && (safetyReview.reviewedBy.length === 0 || safetyReview.reviewedAt === null || Number.isNaN(Date.parse(safetyReview.reviewedAt)))) {
    invalidReasons.push("completed safety review requires reviewer attribution and a valid reviewedAt timestamp");
  }

  const reasons: string[] = [];
  let status: VoluntaryFeedbackGateReportV1["status"] = "passed";
  if (invalidReasons.length) status = "invalid";
  else if (safetyReview.status === "completed" && safetyReview.seriousIncidentCount > 0) {
    status = "blocked";
    reasons.push(`发现 ${safetyReview.seriousIncidentCount} 个安全、依赖或隐私严重事件`);
  } else if (denominator < 50 || safetyReview.status !== "completed") {
    status = "pending";
    if (denominator < 50) reasons.push(`自愿完成反馈 ${denominator}/50`);
    if (safetyReview.status !== "completed") reasons.push("严重事件人工审查尚未完成");
  } else {
    if ((understandingRate ?? 0) < 0.75) reasons.push("hit + partly 低于 75%");
    if ((positiveMovementRate ?? 0) < 0.6) reasons.push("积极变化低于 60%");
    if ((worseRate ?? 1) > 0.05) reasons.push("worse 高于 5%");
    if ((tooAnalyticalRate ?? 1) > 0.1) reasons.push("too_analytical 高于 10%");
    if (reasons.length) status = "blocked";
  }

  return {
    schemaVersion: "voluntary-feedback-gate-v1",
    generatedAt: (input.now ?? new Date()).toISOString(),
    status,
    completedSegments: denominator,
    incompleteSubmissions,
    thresholds: {
      minimumCompletedSegments: 50,
      understandingHitOrPartlyMinimum: 0.75,
      positiveMovementMinimum: 0.6,
      worseMaximum: 0.05,
      tooAnalyticalMaximum: 0.1,
    },
    observed: {
      understandingHitOrPartlyRate: understandingRate,
      positiveMovementRate,
      worseRate,
      tooAnalyticalRate,
      seriousIncidentCount: safetyReview.status === "completed" ? safetyReview.seriousIncidentCount : null,
    },
    safetyReviewStatus: safetyReview.status,
    reasons,
    invalidReasons,
    privacy: "structured_metadata_only",
    ...(input.provenance ? { provenance: input.provenance } : {}),
  };
}

export function renderVoluntaryFeedbackGateMarkdown(report: VoluntaryFeedbackGateReportV1): string {
  const percent = (value: number | null) => value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
  return [
    "# Voluntary Feedback Gate v1",
    "",
    `- 状态：**${report.status}**`,
    `- 自愿完成片段：${report.completedSegments} / ${report.thresholds.minimumCompletedSegments}`,
    `- 不完整提交：${report.incompleteSubmissions}`,
    `- 严重事件审查：${report.safetyReviewStatus}`,
    ...(report.provenance ? [
      `- Git：${report.provenance.gitCommit}${report.provenance.gitDirty ? "（工作区有未提交改动）" : ""}`,
    ] : []),
    "",
    "| 门槛 | 观察值 | 要求 |",
    "| --- | ---: | ---: |",
    `| hit + partly | ${percent(report.observed.understandingHitOrPartlyRate)} | >= 75% |`,
    `| 积极变化 | ${percent(report.observed.positiveMovementRate)} | >= 60% |`,
    `| worse | ${percent(report.observed.worseRate)} | <= 5% |`,
    `| too_analytical | ${percent(report.observed.tooAnalyticalRate)} | <= 10% |`,
    `| 严重事件 | ${report.observed.seriousIncidentCount ?? "N/A"} | = 0 |`,
    "",
    "## 理由",
    "",
    ...(report.reasons.length ? report.reasons.map((reason) => `- ${reason}`) : ["无"]),
    ...report.invalidReasons.map((reason) => `- 无效：${reason}`),
    "",
    "> 只读取服务端结构化反馈元数据；不读取或导出对话正文。该门槛不能替代盲评。",
    "",
  ].join("\n");
}
