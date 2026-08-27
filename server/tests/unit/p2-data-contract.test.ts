import { describe, expect, it } from "vitest";
import {
  P2_DATA_LIFECYCLE_V1,
  agentHandoffProposalSchema,
  authorizedAgentHandoffSchema,
  interestProfileEntrySchema,
  parseAgentHandoffProposal,
  parseAuthorizedAgentHandoff,
  parseInterestProfileEntry,
} from "../../src/modules/p2/data-contract.js";

const createdAt = "2026-08-27T10:00:00.000Z";

function handoffProposal() {
  return {
    schemaVersion: 1,
    id: "handoff_01",
    status: "proposed",
    fromAgentId: "zen_deer",
    toAgentId: "bird_courier",
    initiatedBy: "agent",
    reason: "capability_match",
    context: { focus: "practical_planning", publicItemId: null, actionId: "action_01", followupId: null },
    createdAt,
    expiresAt: "2026-08-27T10:15:00.000Z",
  };
}

function interestEntry() {
  return {
    schemaVersion: 1,
    id: "interest_01",
    selection: { category: "topic", valueCode: "arts_culture" },
    source: "user_explicit_selection",
    status: "confirmed",
    authorizedAt: createdAt,
    createdAt,
    expiresAt: "2026-09-26T10:00:00.000Z",
  };
}

describe("P2 private data contract v1", () => {
  it("accepts a minimal structured handoff without copying conversation text", () => {
    expect(parseAgentHandoffProposal(handoffProposal())).toMatchObject({ id: "handoff_01", status: "proposed" });
  });

  it("rejects same-agent and overlong handoff proposals", () => {
    expect(agentHandoffProposalSchema.safeParse({ ...handoffProposal(), toAgentId: "zen_deer" }).success).toBe(false);
    expect(agentHandoffProposalSchema.safeParse({ ...handoffProposal(), expiresAt: "2026-08-27T10:15:01.000Z" }).success).toBe(false);
  });

  it.each(["userText", "messages", "memory", "emotion", "risk", "astrology", "contact"])("rejects private handoff field %s", (field) => {
    expect(agentHandoffProposalSchema.safeParse({ ...handoffProposal(), context: { ...handoffProposal().context, [field]: "private" } }).success).toBe(false);
  });

  it("requires an explicit, timely user confirmation before handoff authority changes", () => {
    const authorized = { ...handoffProposal(), status: "authorized", authorization: "explicit_user_confirm", authorizedAt: "2026-08-27T10:05:00.000Z" };
    expect(parseAuthorizedAgentHandoff(authorized)).toMatchObject({ status: "authorized", authorization: "explicit_user_confirm" });
    expect(authorizedAgentHandoffSchema.safeParse({ ...authorized, authorization: "agent_assumed" }).success).toBe(false);
    expect(authorizedAgentHandoffSchema.safeParse({ ...authorized, authorizedAt: "2026-08-27T10:16:00.000Z" }).success).toBe(false);
  });

  it("accepts only enumerated, explicitly selected interest fields", () => {
    expect(parseInterestProfileEntry(interestEntry())).toMatchObject({ source: "user_explicit_selection", status: "confirmed" });
    expect(interestProfileEntrySchema.safeParse({ ...interestEntry(), source: "model_inference" }).success).toBe(false);
    expect(interestProfileEntrySchema.safeParse({ ...interestEntry(), selection: { category: "topic", valueCode: "diagnosed_anxiety" } }).success).toBe(false);
  });

  it.each(["evidence", "userText", "emotion", "risk", "astrology", "contact", "exactLocation"])("rejects private interest field %s", (field) => {
    expect(interestProfileEntrySchema.safeParse({ ...interestEntry(), [field]: "private" }).success).toBe(false);
  });

  it("caps interest retention at 30 days", () => {
    expect(interestProfileEntrySchema.safeParse({ ...interestEntry(), expiresAt: "2026-09-26T10:00:00.001Z" }).success).toBe(false);
  });

  it("defines expiry and user-deletion coverage for every private P2 record", () => {
    expect(P2_DATA_LIFECYCLE_V1.handoff_proposal.deleteOn).toContain("expired");
    expect(P2_DATA_LIFECYCLE_V1.handoff_proposal.deleteOn).toContain("user_deleted");
    expect(P2_DATA_LIFECYCLE_V1.handoff_receipt.deleteOn).toContain("user_deleted");
    expect(P2_DATA_LIFECYCLE_V1.interest_profile.deleteOn).toEqual(expect.arrayContaining(["entry_deleted", "all_interests_deleted", "record_expired", "user_deleted"]));
  });
});
