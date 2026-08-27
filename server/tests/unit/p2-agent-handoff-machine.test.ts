import { describe, expect, it } from "vitest";
import {
  agentHandoffMachineEventSchema,
  createAgentHandoffMachine,
  parseAgentHandoffMachineEvent,
  transitionAgentHandoffXState,
  type AgentHandoffSnapshotV1,
} from "../../src/state-machines/agent-handoff-machine.js";

const proposal = {
  schemaVersion: 1 as const,
  id: "handoff_01",
  status: "proposed" as const,
  fromAgentId: "zen_deer" as const,
  toAgentId: "bird_courier" as const,
  initiatedBy: "agent" as const,
  reason: "capability_match" as const,
  context: { focus: "practical_planning" as const, publicItemId: null, actionId: null, followupId: null },
  createdAt: "2026-08-27T10:00:00.000Z",
  expiresAt: "2026-08-27T10:15:00.000Z",
};

const proposed: AgentHandoffSnapshotV1 = { state: "proposed", authorizedAt: null };

describe("P2 agent handoff machine v1", () => {
  it("exposes the complete finite state set", () => {
    expect(Object.keys(createAgentHandoffMachine({ initial: "proposed", proposal }).states).sort()).toEqual([
      "authorized", "completed", "expired", "proposed", "rejected", "safety_interrupted",
    ]);
  });

  it("rejects unknown, assumed, low-risk, and text-bearing events", () => {
    expect(() => parseAgentHandoffMachineEvent({ type: "FORCE_SWITCH" })).toThrow();
    expect(agentHandoffMachineEventSchema.safeParse({ type: "USER_CONFIRM", authorization: "agent_assumed", occurredAt: "2026-08-27T10:01:00.000Z" }).success).toBe(false);
    expect(agentHandoffMachineEventSchema.safeParse({ type: "SAFETY_INTERRUPT", riskLevel: "low", occurredAt: "2026-08-27T10:01:00.000Z" }).success).toBe(false);
    expect(agentHandoffMachineEventSchema.safeParse({ type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: "2026-08-27T10:01:00.000Z", userText: "不要进入状态机" }).success).toBe(false);
  });

  it("changes authority only after explicit confirmation and a later apply event", () => {
    const direct = transitionAgentHandoffXState({ snapshot: proposed, proposal, event: { type: "APPLY", occurredAt: "2026-08-27T10:01:00.000Z" } });
    expect(direct).toMatchObject({ snapshot: proposed, accepted: false, authorityChange: null });

    const confirmed = transitionAgentHandoffXState({
      snapshot: proposed,
      proposal,
      event: { type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: "2026-08-27T10:02:00.000Z" },
    });
    expect(confirmed).toMatchObject({ snapshot: { state: "authorized", authorizedAt: "2026-08-27T10:02:00.000Z" }, accepted: true, authorityChange: null });

    const applied = transitionAgentHandoffXState({
      snapshot: confirmed.snapshot,
      proposal,
      event: { type: "APPLY", occurredAt: "2026-08-27T10:02:01.000Z" },
    });
    expect(applied).toMatchObject({
      snapshot: { state: "completed" },
      accepted: true,
      authorityChange: { handoffId: "handoff_01", fromAgentId: "zen_deer", toAgentId: "bird_courier" },
    });
  });

  it("rejects non-monotonic or expired authorization paths", () => {
    const authorized: AgentHandoffSnapshotV1 = { state: "authorized", authorizedAt: "2026-08-27T10:05:00.000Z" };
    expect(transitionAgentHandoffXState({ snapshot: authorized, proposal, event: { type: "APPLY", occurredAt: "2026-08-27T10:04:59.000Z" } }).accepted).toBe(false);
    expect(transitionAgentHandoffXState({ snapshot: authorized, proposal, event: { type: "APPLY", occurredAt: proposal.expiresAt } }).accepted).toBe(false);
    expect(transitionAgentHandoffXState({
      snapshot: proposed,
      proposal,
      event: { type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: proposal.expiresAt },
    }).accepted).toBe(false);
  });

  it("honors rejection before and after authorization", () => {
    const rejected = transitionAgentHandoffXState({ snapshot: proposed, proposal, event: { type: "USER_REJECT", occurredAt: "2026-08-27T10:03:00.000Z" } });
    expect(rejected).toMatchObject({ snapshot: { state: "rejected" }, accepted: true, authorityChange: null });
    expect(transitionAgentHandoffXState({ snapshot: rejected.snapshot, proposal, event: { type: "APPLY", occurredAt: "2026-08-27T10:04:00.000Z" } }).accepted).toBe(false);

    const authorized: AgentHandoffSnapshotV1 = { state: "authorized", authorizedAt: "2026-08-27T10:02:00.000Z" };
    expect(transitionAgentHandoffXState({ snapshot: authorized, proposal, event: { type: "USER_REJECT", occurredAt: "2026-08-27T10:03:00.000Z" } }).snapshot.state).toBe("rejected");
  });

  it("expires only at the deadline and never changes authority", () => {
    expect(transitionAgentHandoffXState({ snapshot: proposed, proposal, event: { type: "EXPIRE", occurredAt: "2026-08-27T10:14:59.999Z" } }).accepted).toBe(false);
    expect(transitionAgentHandoffXState({ snapshot: proposed, proposal, event: { type: "EXPIRE", occurredAt: proposal.expiresAt } })).toMatchObject({
      snapshot: { state: "expired" }, accepted: true, authorityChange: null,
    });
  });

  it.each(["high", "imminent"] as const)("lets %s safety interrupt preempt proposed and authorized paths", (riskLevel) => {
    for (const snapshot of [proposed, { state: "authorized", authorizedAt: "2026-08-27T10:02:00.000Z" } as const]) {
      expect(transitionAgentHandoffXState({
        snapshot,
        proposal,
        event: { type: "SAFETY_INTERRUPT", riskLevel, occurredAt: "2026-08-27T10:03:00.000Z" },
      })).toMatchObject({ snapshot: { state: "safety_interrupted" }, accepted: true, authorityChange: null });
    }
  });
});
