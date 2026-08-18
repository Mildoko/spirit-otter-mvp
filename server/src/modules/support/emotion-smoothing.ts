import type { EmotionState } from "@otter/shared";
import { clamp01 } from "../../utils.js";

const WEIGHTS = [0.6, 0.3, 0.1] as const;
const affectDimensions = ["valence", "arousal", "control"] as const;
const supportDimensions = ["stressLoad", "cognitiveOverload", "supportNeed"] as const;

function weightedValue<K extends keyof EmotionState>(states: EmotionState[], dimension: K): number {
  const weightTotal = states.reduce((sum, _state, index) => sum + WEIGHTS[index]!, 0);
  return states.reduce((sum, state, index) => {
    const raw = state[dimension] as number | undefined;
    const value = raw ?? (dimension === "control" ? 0.5 : 0);
    return sum + value * WEIGHTS[index]!;
  }, 0) / weightTotal;
}

export function smoothEmotionState(current: EmotionState, previousRaw: EmotionState[], now = new Date()): EmotionState {
  const eligible = previousRaw.filter((state) => new Date(state.validUntil).getTime() > now.getTime()).slice(0, 2);
  const states = [current, ...eligible];
  const knownAffectStates = states.filter((state) => (state.emotionStatus ?? "unknown") !== "unknown");
  const affectSource = knownAffectStates.length > 0 ? knownAffectStates : [current];
  const affect = Object.fromEntries(affectDimensions.map((dimension) => {
    const weighted = weightedValue(affectSource, dimension);
    return [dimension, dimension === "valence" ? Math.max(-1, Math.min(1, weighted)) : clamp01(weighted)];
  })) as Pick<EmotionState, typeof affectDimensions[number]>;
  const support = Object.fromEntries(supportDimensions.map((dimension) => [dimension, clamp01(weightedValue(states, dimension))])) as Pick<EmotionState, typeof supportDimensions[number]>;
  return { ...current, ...affect, ...support };
}
