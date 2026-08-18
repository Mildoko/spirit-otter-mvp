import { describe, expect, it } from "vitest";
import { rawSignalsSchema } from "../../src/modules/support/schemas.js";

const valid = {
  sentimentPolarity: 0, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.2,
  taskPressureScore: 0.2, supportSeekingScore: 0.4, expressionClarityScore: 0.6, progressReadinessScore: 0.5,
  evidenceSpans: ["原文证据"], confidence: 0.8, modelRiskHint: "low",
};

describe("raw signal schema", () => {
  it("accepts the two calibrated low-signal dimensions", () => {
    expect(rawSignalsSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { expressionClarityScore: undefined },
    { progressReadinessScore: undefined },
    { expressionClarityScore: -0.01 },
    { progressReadinessScore: 1.01 },
  ])("rejects missing or out-of-range fields: %o", (override) => {
    expect(rawSignalsSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("rejects malformed JSON before schema validation", () => {
    expect(() => JSON.parse("{not-json")) .toThrow();
  });
});
