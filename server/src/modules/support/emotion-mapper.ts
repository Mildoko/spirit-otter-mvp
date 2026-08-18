import type { EmotionHypothesisV1, EmotionState, RawSignals } from "@otter/shared";
import { addHours, clamp01 } from "../../utils.js";

export function mapEmotionState(signals: RawSignals, hypothesis: EmotionHypothesisV1, now = new Date()): EmotionState {
  return {
    valence: hypothesis.valence,
    arousal: hypothesis.arousal,
    stressLoad: clamp01(signals.taskPressureScore * 0.5 + signals.helplessnessScore * 0.5),
    cognitiveOverload: clamp01(signals.overloadCueScore * 0.8 + signals.urgencyScore * 0.2),
    supportNeed: clamp01(signals.supportSeekingScore * 0.7 + signals.helplessnessScore * 0.3),
    control: hypothesis.control,
    emotionStatus: hypothesis.status,
    emotionLabels: hypothesis.labels,
    emotionSubject: hypothesis.subject,
    emotionSchemaVersion: hypothesis.schemaVersion,
    confidence: hypothesis.confidence,
    evidenceSpans: [...new Set([...signals.evidenceSpans, ...hypothesis.labels.flatMap((item) => item.evidenceSpans)])].slice(0, 5),
    validUntil: addHours(now, 24).toISOString(),
  };
}
