import type { AgentHandoffProposalV1, AgentIdV1 } from "@otter/shared";
import { assign, createActor, setup } from "xstate";
import { z } from "zod";
import { parseAgentHandoffProposal } from "../modules/p2/data-contract.js";

export type AgentHandoffStateV1 = "proposed" | "authorized" | "completed" | "rejected" | "expired" | "safety_interrupted";
const terminalHandoffStates = new Set<AgentHandoffStateV1>(["completed", "rejected", "expired", "safety_interrupted"]);

export interface AgentHandoffSnapshotV1 {
  state: AgentHandoffStateV1;
  authorizedAt: string | null;
}

export const agentHandoffMachineEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("USER_CONFIRM"), authorization: z.literal("explicit_user_confirm"), occurredAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("USER_REJECT"), occurredAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("APPLY"), occurredAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("EXPIRE"), occurredAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal("SAFETY_INTERRUPT"), riskLevel: z.enum(["high", "imminent"]), occurredAt: z.string().datetime({ offset: true }) }).strict(),
]);
export type AgentHandoffMachineEvent = z.infer<typeof agentHandoffMachineEventSchema>;

interface HandoffMachineContext {
  proposal: AgentHandoffProposalV1;
  authorizedAt: string | null;
}

function occursDuringProposal(proposal: AgentHandoffProposalV1, occurredAt: string): boolean {
  const eventTime = Date.parse(occurredAt);
  return eventTime >= Date.parse(proposal.createdAt) && eventTime < Date.parse(proposal.expiresAt);
}

export function parseAgentHandoffMachineEvent(value: unknown): AgentHandoffMachineEvent {
  return agentHandoffMachineEventSchema.parse(value);
}

export function createAgentHandoffMachine(input: {
  initial: AgentHandoffStateV1;
  proposal: AgentHandoffProposalV1;
  authorizedAt?: string | null;
}) {
  const proposal = parseAgentHandoffProposal(input.proposal);
  return setup({
    types: {
      context: {} as HandoffMachineContext,
      events: {} as AgentHandoffMachineEvent,
    },
    guards: {
      duringProposal: ({ context, event }) => occursDuringProposal(context.proposal, event.occurredAt),
      atOrAfterExpiry: ({ context, event }) => Date.parse(event.occurredAt) >= Date.parse(context.proposal.expiresAt),
      authorizedChronology: ({ context, event }) => context.authorizedAt !== null
        && Date.parse(event.occurredAt) >= Date.parse(context.authorizedAt)
        && occursDuringProposal(context.proposal, event.occurredAt),
    },
    actions: {
      recordAuthorization: assign({ authorizedAt: ({ event }) => event.type === "USER_CONFIRM" ? event.occurredAt : null }),
    },
  }).createMachine({
    id: "agent-handoff-v1",
    initial: input.initial,
    context: { proposal, authorizedAt: input.authorizedAt ?? null },
    states: {
      proposed: {
        on: {
          USER_CONFIRM: { target: "authorized", guard: "duringProposal", actions: "recordAuthorization" },
          USER_REJECT: { target: "rejected", guard: "duringProposal" },
          EXPIRE: { target: "expired", guard: "atOrAfterExpiry" },
          SAFETY_INTERRUPT: "safety_interrupted",
        },
      },
      authorized: {
        on: {
          APPLY: { target: "completed", guard: "authorizedChronology" },
          USER_REJECT: { target: "rejected", guard: "duringProposal" },
          EXPIRE: { target: "expired", guard: "atOrAfterExpiry" },
          SAFETY_INTERRUPT: "safety_interrupted",
        },
      },
      completed: { type: "final" },
      rejected: { type: "final" },
      expired: { type: "final" },
      safety_interrupted: { type: "final" },
    },
  });
}

export function transitionAgentHandoffXState(input: {
  snapshot: AgentHandoffSnapshotV1;
  proposal: AgentHandoffProposalV1;
  event: AgentHandoffMachineEvent;
}): {
  snapshot: AgentHandoffSnapshotV1;
  accepted: boolean;
  authorityChange: { handoffId: string; fromAgentId: AgentIdV1; toAgentId: AgentIdV1 } | null;
} {
  const event = parseAgentHandoffMachineEvent(input.event);
  if (terminalHandoffStates.has(input.snapshot.state)) {
    return { snapshot: input.snapshot, accepted: false, authorityChange: null };
  }
  const actor = createActor(createAgentHandoffMachine({
    initial: input.snapshot.state,
    proposal: input.proposal,
    authorizedAt: input.snapshot.authorizedAt,
  }));
  actor.start();
  actor.send(event);
  const next = actor.getSnapshot();
  actor.stop();
  const nextState = next.value as AgentHandoffStateV1;
  const accepted = nextState !== input.snapshot.state;
  const authorityChange = accepted && event.type === "APPLY" && nextState === "completed"
    ? { handoffId: input.proposal.id, fromAgentId: input.proposal.fromAgentId, toAgentId: input.proposal.toAgentId }
    : null;
  return {
    snapshot: { state: nextState, authorizedAt: next.context.authorizedAt },
    accepted,
    authorityChange,
  };
}
