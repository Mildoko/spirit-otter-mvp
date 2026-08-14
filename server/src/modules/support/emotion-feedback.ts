import type { EmotionState, PublicEmotionCue, PublicEmotionFeedback } from "@otter/shared";

type PreviousState = Pick<EmotionState, "valence" | "arousal" | "stressLoad" | "cognitiveOverload" | "supportNeed">;

const CHANGE_THRESHOLD = 0.1;

function changedCue(
  dimension: PublicEmotionCue["dimension"],
  delta: number,
  softerText: string,
  strongerText: string,
): PublicEmotionCue | null {
  if (Math.abs(delta) < CHANGE_THRESHOLD) return null;
  return delta > 0
    ? { dimension, text: strongerText, tone: "intensifying" }
    : { dimension, text: softerText, tone: "softening" };
}

export function buildPublicEmotionFeedback(
  current: EmotionState,
  previous?: PreviousState | null,
  now = new Date(),
): PublicEmotionFeedback {
  let cues: PublicEmotionCue[] = [];

  if (previous) {
    const changes: Array<{ magnitude: number; cue: PublicEmotionCue | null }> = [
      {
        magnitude: Math.abs(current.valence - previous.valence),
        // Higher valence means the expression became less negative.
        cue: changedCue("valence", previous.valence - current.valence, "情绪稍微亮了一点", "情绪又沉了一些"),
      },
      {
        magnitude: Math.abs(current.arousal - previous.arousal),
        cue: changedCue("arousal", current.arousal - previous.arousal, "心绪慢下来一点", "心绪更紧了一些"),
      },
      {
        magnitude: Math.abs(current.stressLoad - previous.stressLoad),
        cue: changedCue("stress", current.stressLoad - previous.stressLoad, "压力松开一点", "压力又重了一些"),
      },
      {
        magnitude: Math.abs(current.cognitiveOverload - previous.cognitiveOverload),
        cue: changedCue("overload", current.cognitiveOverload - previous.cognitiveOverload, "思绪清楚了一点", "思绪更拥挤了"),
      },
      {
        magnitude: Math.abs(current.supportNeed - previous.supportNeed),
        cue: changedCue("support", current.supportNeed - previous.supportNeed, "此刻更能自己站稳一点", "此刻更需要有人陪着"),
      },
    ];
    cues = changes
      .filter((item): item is { magnitude: number; cue: PublicEmotionCue } => Boolean(item.cue))
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, 3)
      .map((item) => item.cue);
  }

  if (cues.length === 0) {
    const currentCues: Array<{ score: number; cue: PublicEmotionCue }> = [
      { score: current.stressLoad, cue: { dimension: "stress", text: "压力正压得有些重", tone: "steady" } },
      { score: current.cognitiveOverload, cue: { dimension: "overload", text: "思绪有些拥挤", tone: "steady" } },
      { score: current.arousal, cue: { dimension: "arousal", text: "心绪还绷着", tone: "steady" } },
      { score: Math.max(0, -current.valence), cue: { dimension: "valence", text: "此刻的情绪有些沉", tone: "steady" } },
      { score: current.supportNeed, cue: { dimension: "support", text: "此刻更需要一点支持", tone: "steady" } },
    ];
    cues = currentCues
      .filter((item) => item.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.cue);
  }

  return {
    observedAt: now.toISOString(),
    disclaimer: "AI 对这一刻的暂时理解，可能不准确",
    cues,
  };
}
