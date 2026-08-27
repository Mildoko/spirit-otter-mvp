import type { AiTelemetry } from "../observability/ai-telemetry.js";
import type { FollowupOutcomeState } from "../followups/outcome-state.js";
import { canTransitionFollowupOutcome } from "../followups/outcome-state.js";
import { transitionFollowupXState, type FollowupMachineEvent, type FollowupStatus } from "./followup-machine.js";
import type { StateTransitionResult } from "./action-transition.js";

export interface FollowupTransitionState {
  status: FollowupStatus;
  outcomeState: FollowupOutcomeState;
}

function transitionLegacy(input: {
  status: FollowupStatus;
  outcomeState: FollowupOutcomeState;
  outcomeLabeled: boolean;
  event: FollowupMachineEvent;
}): { state: FollowupTransitionState; accepted: boolean } {
  const unchanged = { state: { status: input.status, outcomeState: input.outcomeState }, accepted: false };
  if (input.event.type === "LABEL_OUTCOME") {
    if (input.status === "deleted" || !canTransitionFollowupOutcome(input.outcomeState, input.event.state)
      || (input.outcomeLabeled && input.outcomeState === input.event.state)) return unchanged;
    return { state: { status: input.event.state === "completed" ? "completed" : "closed", outcomeState: input.event.state }, accepted: true };
  }
  if (input.status === "closed" || input.status === "deleted") return unchanged;
  if (input.event.type === "COMPLETE") return { state: { status: "completed", outcomeState: input.outcomeState }, accepted: true };
  if (input.event.type === "DEFER") return { state: { status: "deferred", outcomeState: input.outcomeState }, accepted: true };
  if (input.event.type === "CLOSE") return { state: { status: "closed", outcomeState: input.outcomeState }, accepted: true };
  return { state: { status: "deleted", outcomeState: input.outcomeState }, accepted: true };
}

export function resolveFollowupTransition(input: {
  mode: "legacy" | "shadow" | "new";
  status: FollowupStatus;
  outcomeState: FollowupOutcomeState;
  outcomeLabeled: boolean;
  event: FollowupMachineEvent;
  telemetry?: AiTelemetry | undefined;
}): StateTransitionResult<FollowupTransitionState> {
  const legacy = transitionLegacy(input);
  if (input.mode === "legacy") return { ...legacy, parity: "not_checked" };
  const candidate = transitionFollowupXState(input);
  const parity = candidate.status === legacy.state.status && candidate.outcomeState === legacy.state.outcomeState
    && candidate.accepted === legacy.accepted ? "match" : "mismatch";
  input.telemetry?.recordStateParity({ domain: "followup", engine: input.mode, outcome: parity });
  const selected = input.mode === "new" ? { state: { status: candidate.status, outcomeState: candidate.outcomeState }, accepted: candidate.accepted } : legacy;
  return { ...selected, parity };
}
