import { z } from "zod";

export const FOLLOWUP_OUTCOME_VERSION = "followup-outcome-v1" as const;
export const followupOutcomeValues = ["not_started", "partial_progress", "completed", "blocked", "redefined"] as const;
export const followupOutcomeSchema = z.enum(followupOutcomeValues);
export type FollowupOutcomeState = z.infer<typeof followupOutcomeSchema>;

const transitions: Record<FollowupOutcomeState, readonly FollowupOutcomeState[]> = {
  not_started: ["not_started", "partial_progress", "completed", "blocked", "redefined"],
  partial_progress: ["partial_progress", "completed", "blocked", "redefined"],
  completed: ["completed"],
  blocked: ["blocked", "partial_progress", "completed", "redefined"],
  redefined: ["redefined", "not_started", "partial_progress", "completed", "blocked"],
};

export function canTransitionFollowupOutcome(from: FollowupOutcomeState, to: FollowupOutcomeState): boolean {
  return transitions[from].includes(to);
}

export function assertFollowupOutcomeTransition(input: {
  from: FollowupOutcomeState;
  to: FollowupOutcomeState;
  wasPreviouslyLabeled: boolean;
}): void {
  if (!canTransitionFollowupOutcome(input.from, input.to)) {
    throw Object.assign(new Error(`回访结果不能从 ${input.from} 变为 ${input.to}`), { statusCode: 409, code: "INVALID_FOLLOWUP_OUTCOME_TRANSITION" });
  }
  if (input.wasPreviouslyLabeled && input.from === input.to) {
    throw Object.assign(new Error("回访结果没有变化"), { statusCode: 409, code: "FOLLOWUP_OUTCOME_UNCHANGED" });
  }
}

export function lifecycleStatusForOutcome(state: FollowupOutcomeState): "completed" | "closed" {
  if (state === "completed") return "completed";
  return "closed";
}
