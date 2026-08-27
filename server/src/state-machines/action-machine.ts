import type { ActionStatus } from "@otter/shared";
import { createActor, setup } from "xstate";
import { z } from "zod";

export const actionMachineEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CONFIRM") }).strict(),
  z.object({ type: z.literal("ABANDON") }).strict(),
  z.object({ type: z.literal("COMPLETE") }).strict(),
  z.object({ type: z.literal("DEFER") }).strict(),
  z.object({ type: z.literal("DELETE") }).strict(),
]);
export type ActionMachineEvent = z.infer<typeof actionMachineEventSchema>;

const targets = {
  COMPLETE: "completed",
  DEFER: "deferred",
  DELETE: "deleted",
} as const;

export function parseActionMachineEvent(value: unknown): ActionMachineEvent {
  return actionMachineEventSchema.parse(value);
}

export function createActionMachine(initialStatus: ActionStatus) {
  return setup({ types: { events: {} as ActionMachineEvent } }).createMachine({
    id: "action-v1",
    initial: initialStatus,
    states: {
      draft: { on: { CONFIRM: "confirmed", ABANDON: "deleted" } },
      confirmed: { on: targets },
      completed: { on: targets },
      deferred: { on: targets },
      deleted: { type: "final" },
    },
  });
}

export function transitionActionXState(status: ActionStatus, event: ActionMachineEvent): { status: ActionStatus; accepted: boolean } {
  const actor = createActor(createActionMachine(status));
  actor.start();
  actor.send(event);
  const next = actor.getSnapshot();
  const accepted = next.value !== status || (status !== "draft" && status !== "deleted" && (
    event.type === "COMPLETE" || event.type === "DEFER" || event.type === "DELETE"
  ));
  actor.stop();
  return { status: next.value as ActionStatus, accepted };
}
