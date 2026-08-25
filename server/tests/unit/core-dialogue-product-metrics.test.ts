import { describe, expect, it } from "vitest";
import { CORE_DIALOGUE_EVENT_VERSION } from "../../src/events/core-dialogue-events.js";
import { calculateCoreDialogueProductMetrics, type ProductMetricEvent } from "../../src/metrics/core-dialogue-product-metrics.js";

function event(id: string, eventType: string, metadataJson: Record<string, unknown>): ProductMetricEvent {
  return { id, eventType, eventVersion: CORE_DIALOGUE_EVENT_VERSION, metadataJson, occurredAt: new Date(`2026-08-20T00:00:0${id.length}Z`) };
}

const context = { sessionId: "session_1", conversationId: "conversation_1" };

describe("Core Dialogue Product Metrics v1", () => {
  it("calculates structural rates without inventing unavailable metrics", () => {
    const report = calculateCoreDialogueProductMetrics([
      event("turn1", "user_turn_submitted", { ...context, turnId: "turn_1", messageLengthBucket: "short", hasFollowupContext: false, hasConfirmedActionContext: false }),
      event("turn2", "user_turn_submitted", { ...context, turnId: "turn_2", messageLengthBucket: "short", hasFollowupContext: true, hasConfirmedActionContext: true }),
      event("action1", "action_generated", { ...context, turnId: "turn_2", actionId: "action_1", actionType: "start", isSingleAction: true, estimatedStartBucket: "under_5m", externalDependencyLevel: "low" }),
      event("action2", "action_confirmed", { ...context, actionId: "action_1", confirmationType: "ui_confirm", edited: false }),
      event("followup1", "followup_reentered", { ...context, followupId: "followup_1", reentryAfterDueHoursBucket: "under_1h" }),
      event("followup2", "followup_state_labeled", { ...context, followupId: "followup_1", previousState: "not_started", state: "partial_progress", revision: 1, labelSource: "ui_select", transitionValid: true }),
      event("healing1", "healing_turn_completed", { ...context, turnId: "turn_2", segmentId: "segment_1", status: "active", goal: "agency", depth: "bridge", rupture: "none", realityPressure: "none", responseSource: "local_fallback", primaryStrategy: "direct_advice" }),
      event("feedback1", "conversation_feedback_requested", { ...context, segmentId: "segment_1", source: "end_chat" }),
      event("feedback2", "conversation_feedback_submitted", { ...context, segmentId: "segment_1", feedbackSchemaVersion: 2, verdict: "helpful", understanding: "partly", movement: "clearer", reason: null, source: "end_chat" }),
    ]);
    expect(report.status).toBe("valid");
    expect(report.metrics.find((metric) => metric.metricId === "aar_v1")?.rate).toBe(1);
    expect(report.metrics.find((metric) => metric.metricId === "frr_v1")?.rate).toBe(1);
    expect(report.metrics.find((metric) => metric.metricId === "mpr_proxy_v1")?.availability).toBe("proxy_observational");
    expect(report.metrics.find((metric) => metric.metricId === "sar_v1")?.rate).toBeNull();
    expect(report.metrics.find((metric) => metric.metricId === "conversation_helpful_v2")?.rate).toBe(1);
    expect(report.metrics.find((metric) => metric.metricId === "conversation_feedback_detail_v2")?.rate).toBe(1);
    expect(report.metrics.find((metric) => metric.metricId === "feedback_by_response_path_v2")?.rate).toBe(1);
    expect(report.feedbackResponsePathDistribution["local_fallback:direct_advice"]).toEqual({ helpful: 1, notHelpful: 0, total: 1 });
    expect(report.releaseDecision).toBe("not_determined");
  });

  it("is invalid without current-version events", () => {
    const report = calculateCoreDialogueProductMetrics([]);
    expect(report.status).toBe("invalid");
    expect(report.invalidReasons[0]).toContain(CORE_DIALOGUE_EVENT_VERSION);
  });
});
