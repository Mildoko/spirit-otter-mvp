import { describe, expect, it } from "vitest";
import { CORE_DIALOGUE_EVENT_VERSION } from "../../src/events/core-dialogue-events.js";
import { evaluateVoluntaryFeedbackGate, type ResearchSafetyReviewV1 } from "../../src/research/voluntary-feedback-gate.js";
import type { ProductMetricEvent } from "../../src/metrics/core-dialogue-product-metrics.js";

const context = { sessionId: "session_1", conversationId: "conversation_1" };
const safetyReview: ResearchSafetyReviewV1 = {
  schemaVersion: "research-safety-review-v1",
  status: "completed",
  seriousIncidentCount: 0,
  reviewedBy: ["researcher_1"],
  reviewedAt: "2026-08-26T00:00:00.000Z",
};

function feedback(index: number, overrides: Record<string, unknown> = {}): ProductMetricEvent {
  return {
    id: `feedback_${index}`,
    eventType: "conversation_feedback_submitted",
    eventVersion: CORE_DIALOGUE_EVENT_VERSION,
    occurredAt: new Date(1_700_000_000_000 + index),
    metadataJson: {
      ...context,
      segmentId: `segment_${index}`,
      feedbackSchemaVersion: 2,
      verdict: "helpful",
      understanding: "hit",
      movement: "more_space",
      reason: null,
      source: "end_chat",
      ...overrides,
    },
  };
}

describe("voluntary feedback gate v1", () => {
  it("stays pending and does not fabricate a completed study", () => {
    const report = evaluateVoluntaryFeedbackGate({ events: [feedback(1)] });
    expect(report.status).toBe("pending");
    expect(report.completedSegments).toBe(1);
    expect(report.observed.seriousIncidentCount).toBeNull();
  });

  it("passes only when all frozen thresholds and the safety review pass", () => {
    const events = Array.from({ length: 50 }, (_, index) => feedback(index));
    const report = evaluateVoluntaryFeedbackGate({ events, safetyReview });
    expect(report.status).toBe("passed");
    expect(report.completedSegments).toBe(50);
  });

  it("blocks on threshold failure or any serious incident", () => {
    const events = Array.from({ length: 50 }, (_, index) => feedback(index, index < 4 ? { movement: "worse" } : {}));
    expect(evaluateVoluntaryFeedbackGate({ events, safetyReview }).status).toBe("blocked");
    expect(evaluateVoluntaryFeedbackGate({ events: Array.from({ length: 50 }, (_, index) => feedback(index)), safetyReview: { ...safetyReview, seriousIncidentCount: 1 } }).status).toBe("blocked");
  });

  it("deduplicates segments and excludes thumbs-only submissions", () => {
    const first = feedback(1);
    const duplicate = { ...feedback(2), metadataJson: { ...(feedback(2).metadataJson as Record<string, unknown>), segmentId: "segment_1" } };
    const incomplete = feedback(3, { understanding: null, movement: null });
    const report = evaluateVoluntaryFeedbackGate({ events: [first, duplicate, incomplete], safetyReview });
    expect(report.completedSegments).toBe(1);
    expect(report.incompleteSubmissions).toBe(1);
  });
});
