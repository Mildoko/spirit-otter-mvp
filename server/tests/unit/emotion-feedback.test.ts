import { describe, expect, it } from "vitest";
import type { EmotionState } from "@otter/shared";
import { buildPublicEmotionFeedback } from "../../src/modules/support/emotion-feedback.js";

const base: EmotionState = {
  valence: -0.6,
  arousal: 0.7,
  stressLoad: 0.8,
  cognitiveOverload: 0.75,
  supportNeed: 0.7,
  confidence: 0.8,
  evidenceSpans: [],
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
};

describe("public emotion feedback", () => {
  it("uses qualitative current-state cues without exposing scores", () => {
    const feedback = buildPublicEmotionFeedback(base);
    expect(feedback.cues.length).toBeGreaterThan(0);
    expect(feedback).not.toHaveProperty("confidence");
    expect(feedback).not.toHaveProperty("raw");
    expect(feedback).not.toHaveProperty("smoothed");
    expect(feedback.cues.every((cue) => typeof cue.text === "string" && !/\d/.test(cue.text))).toBe(true);
  });

  it("describes meaningful softening relative to the previous turn", () => {
    const feedback = buildPublicEmotionFeedback(
      { ...base, valence: -0.3, arousal: 0.35, stressLoad: 0.45, cognitiveOverload: 0.4 },
      base,
    );
    expect(feedback.cues.map((cue) => cue.text)).toContain("压力松开一点");
    expect(feedback.cues.every((cue) => cue.tone === "softening")).toBe(true);
  });
});
