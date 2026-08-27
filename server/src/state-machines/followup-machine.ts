import type { PublicFollowup } from "@otter/shared";
import { createActor, setup } from "xstate";
import { z } from "zod";
import { canTransitionFollowupOutcome, followupOutcomeSchema, type FollowupOutcomeState } from "../followups/outcome-state.js";

export type FollowupStatus = PublicFollowup["status"];

export const followupMachineEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("COMPLETE") }).strict(),
  z.object({ type: z.literal("DEFER") }).strict(),
  z.object({ type: z.literal("CLOSE") }).strict(),
  z.object({ type: z.literal("DELETE") }).strict(),
  z.object({ type: z.literal("LABEL_OUTCOME"), state: followupOutcomeSchema }).strict(),
]);
export type FollowupMachineEvent = z.infer<typeof followupMachineEventSchema>;

export function parseFollowupMachineEvent(value: unknown): FollowupMachineEvent {
  return followupMachineEventSchema.parse(value);
}

export function assertFollowupCreation(input: { authorized: boolean; actionStatus: string }): void {
  if (!input.authorized) throw Object.assign(new Error("创建回访需要用户明确授权"), { statusCode: 400, code: "FOLLOWUP_NOT_AUTHORIZED" });
  if (input.actionStatus !== "confirmed") throw Object.assign(new Error("只能为已确认行动创建回访"), { statusCode: 400, code: "ACTION_NOT_CONFIRMED" });
}

const patchTargets = { COMPLETE: "completed", DEFER: "deferred", CLOSE: "closed", DELETE: "deleted" } as const;

export function createFollowupMachine(initialStatus: FollowupStatus) {
  return setup({ types: { events: {} as FollowupMachineEvent } }).createMachine({
    id: "followup-v1",
    initial: initialStatus,
    states: {
      pending: { on: patchTargets },
      completed: { on: patchTargets },
      deferred: { on: patchTargets },
      closed: {},
      deleted: { type: "final" },
    },
  });
}

export function transitionFollowupXState(input: {
  status: FollowupStatus;
  outcomeState: FollowupOutcomeState;
  outcomeLabeled: boolean;
  event: FollowupMachineEvent;
}): { status: FollowupStatus; outcomeState: FollowupOutcomeState; accepted: boolean } {
  if (input.event.type === "LABEL_OUTCOME") {
    const accepted = input.status !== "deleted"
      && canTransitionFollowupOutcome(input.outcomeState, input.event.state)
      && !(input.outcomeLabeled && input.outcomeState === input.event.state);
    return accepted
      ? { status: input.event.state === "completed" ? "completed" : "closed", outcomeState: input.event.state, accepted: true }
      : { status: input.status, outcomeState: input.outcomeState, accepted: false };
  }
  const actor = createActor(createFollowupMachine(input.status));
  actor.start();
  actor.send(input.event);
  const snapshot = actor.getSnapshot();
  const accepted = snapshot.value !== input.status || (["pending", "completed", "deferred"].includes(input.status));
  actor.stop();
  return { status: snapshot.value as FollowupStatus, outcomeState: input.outcomeState, accepted };
}
