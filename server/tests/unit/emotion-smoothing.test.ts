import { describe, expect, it } from "vitest";
import type { EmotionState } from "@otter/shared";
import { smoothEmotionState } from "../../src/modules/support/emotion-smoothing.js";

const now = new Date("2026-08-14T08:00:00.000Z");
function state(value: number, validUntil = "2026-08-15T08:00:00.000Z"): EmotionState {
  return { valence: value, arousal: value, stressLoad: value, cognitiveOverload: value, supportNeed: value, control: value, emotionStatus: "inferred", emotionLabels: [], emotionSubject: "user", emotionSchemaVersion: 1, confidence: 0.5, evidenceSpans: [], validUntil };
}

describe("smoothEmotionState", () => {
  it("renormalizes one, two and three available turns", () => {
    expect(smoothEmotionState(state(1), [], now).stressLoad).toBe(1);
    expect(smoothEmotionState(state(1), [state(0)], now).stressLoad).toBeCloseTo(2 / 3);
    expect(smoothEmotionState(state(1), [state(0), state(0.5)], now).stressLoad).toBeCloseTo(0.65);
  });

  it("ignores expired history and clamps dimensions", () => {
    expect(smoothEmotionState(state(0.5), [state(1, "2026-08-14T07:59:59.000Z")], now).stressLoad).toBe(0.5);
    expect(smoothEmotionState({ ...state(0), valence: -1 }, [{ ...state(1), valence: 1 }], now).valence).toBeCloseTo(-1 / 3);
  });

  it("does not let an unknown current turn overwrite the last known affect", () => {
    const result = smoothEmotionState({ ...state(0), emotionStatus: "unknown", valence: 0 }, [{ ...state(0.8), valence: 0.8 }], now);
    expect(result.valence).toBeCloseTo(0.8);
    expect(result.emotionStatus).toBe("unknown");
  });
});
