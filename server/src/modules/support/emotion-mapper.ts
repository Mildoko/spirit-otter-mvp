import type { EmotionState, RawSignals } from "@otter/shared";
import { addHours, clamp01 } from "../../utils.js";

export function mapEmotionState(signals: RawSignals, now = new Date()): EmotionState {
  return {
    valence: signals.sentimentPolarity,
    arousal: clamp01(signals.urgencyScore * 0.7 + signals.overloadCueScore * 0.3),
    stressLoad: clamp01(signals.taskPressureScore * 0.5 + signals.helplessnessScore * 0.5),
    cognitiveOverload: clamp01(signals.overloadCueScore * 0.8 + signals.urgencyScore * 0.2),
    supportNeed: clamp01(signals.supportSeekingScore * 0.7 + signals.helplessnessScore * 0.3),
    confidence: signals.confidence,
    evidenceSpans: signals.evidenceSpans,
    validUntil: addHours(now, 24).toISOString(),
  };
}
