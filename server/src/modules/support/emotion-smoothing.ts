import type { EmotionState } from "@otter/shared";
import { clamp01 } from "../../utils.js";

const WEIGHTS = [0.6, 0.3, 0.1] as const;
const dimensions = ["valence", "arousal", "stressLoad", "cognitiveOverload", "supportNeed"] as const;

export function smoothEmotionState(current: EmotionState, previousRaw: EmotionState[], now = new Date()): EmotionState {
  const eligible = previousRaw.filter((state) => new Date(state.validUntil).getTime() > now.getTime()).slice(0, 2);
  const states = [current, ...eligible];
  const weightTotal = states.reduce((sum, _state, index) => sum + WEIGHTS[index]!, 0);
  const values = Object.fromEntries(dimensions.map((dimension) => {
    const weighted = states.reduce((sum, state, index) => sum + state[dimension] * WEIGHTS[index]!, 0) / weightTotal;
    return [dimension, dimension === "valence" ? Math.max(-1, Math.min(1, weighted)) : clamp01(weighted)];
  })) as Pick<EmotionState, typeof dimensions[number]>;
  return { ...current, ...values };
}
