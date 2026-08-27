import type { ActionStatus } from "@otter/shared";
import type { AiTelemetry } from "../observability/ai-telemetry.js";
import { transitionActionXState, type ActionMachineEvent } from "./action-machine.js";

export interface StateTransitionResult<T> {
  state: T;
  accepted: boolean;
  parity: "not_checked" | "match" | "mismatch";
}

function transitionLegacy(status: ActionStatus, event: ActionMachineEvent): { status: ActionStatus; accepted: boolean } {
  if (status === "draft") {
    if (event.type === "CONFIRM") return { status: "confirmed", accepted: true };
    if (event.type === "ABANDON") return { status: "deleted", accepted: true };
    return { status, accepted: false };
  }
  if (status === "deleted" || event.type === "CONFIRM" || event.type === "ABANDON") return { status, accepted: false };
  if (event.type === "COMPLETE") return { status: "completed", accepted: true };
  if (event.type === "DEFER") return { status: "deferred", accepted: true };
  return { status: "deleted", accepted: true };
}

export function resolveActionTransition(input: {
  mode: "legacy" | "shadow" | "new";
  status: ActionStatus;
  event: ActionMachineEvent;
  telemetry?: AiTelemetry | undefined;
}): StateTransitionResult<ActionStatus> {
  const legacy = transitionLegacy(input.status, input.event);
  if (input.mode === "legacy") return { state: legacy.status, accepted: legacy.accepted, parity: "not_checked" };
  const candidate = transitionActionXState(input.status, input.event);
  const parity = candidate.status === legacy.status && candidate.accepted === legacy.accepted ? "match" : "mismatch";
  input.telemetry?.recordStateParity({ domain: "action", engine: input.mode, outcome: parity });
  const selected = input.mode === "new" ? candidate : legacy;
  return { state: selected.status, accepted: selected.accepted, parity };
}
