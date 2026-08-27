import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupExpiredAgentHandoffs,
  findAgentHandoffForUser,
  persistAgentHandoffProposal,
  transitionPersistedAgentHandoff,
} from "../../src/modules/p2/agent-handoff-repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
if (!testDatabaseUrl && process.env.npm_lifecycle_event === "test:integration") {
  describe("P2 handoff Postgres environment", () => {
    it("requires TEST_DATABASE_URL", () => {
      expect(testDatabaseUrl, "TEST_DATABASE_URL is required; P2 persistence must not be reported as skipped").toBeTruthy();
    });
  });
}

integration("P2 agent handoff Postgres persistence", () => {
  let db: PrismaClient;
  const researchPrefix = `P2-HANDOFF-${Date.now()}`;

  beforeAll(() => {
    db = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  });

  afterAll(async () => {
    await db?.anonymousUser.deleteMany({ where: { researchId: { startsWith: researchPrefix } } });
    await db?.$disconnect();
  });

  async function createUser(suffix: string) {
    const now = new Date();
    const user = await db.anonymousUser.create({ data: {
      researchId: `${researchPrefix}-${suffix}`,
      adultConfirmedAt: now,
      aiDisclosureAcceptedAt: now,
      cloudProcessingAcceptedAt: now,
      dataConsentAcceptedAt: now,
      deepInterpretationAcceptedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    } });
    const conversation = await db.conversation.create({ data: { userId: user.id } });
    return { user, conversation };
  }

  function proposal(id: string, createdAt: Date) {
    return {
      schemaVersion: 1 as const,
      id,
      status: "proposed" as const,
      fromAgentId: "zen_deer" as const,
      toAgentId: "bird_courier" as const,
      initiatedBy: "agent" as const,
      reason: "capability_match" as const,
      context: { focus: "practical_planning" as const, publicItemId: null, actionId: null, followupId: null },
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString(),
    };
  }

  it("isolates reads, persists authorization, and cascades account deletion", async () => {
    const first = await createUser("FIRST");
    const second = await createUser("SECOND");
    const now = new Date();
    const saved = await persistAgentHandoffProposal(db, { userId: first.user.id, conversationId: first.conversation.id, proposal: proposal(`${researchPrefix}_01`, now) });
    expect(saved).toMatchObject({ status: "proposed", focus: "practical_planning", authorization: null });
    expect(await findAgentHandoffForUser(db, second.user.id, saved.id)).toBeNull();

    const confirmedAt = new Date(now.getTime() + 60_000).toISOString();
    const authorized = await transitionPersistedAgentHandoff(db, {
      userId: first.user.id,
      id: saved.id,
      event: { type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: confirmedAt },
    });
    expect(authorized.record).toMatchObject({ status: "authorized", authorization: "explicit_user_confirm" });
    expect(authorized.authorityChange).toBeNull();

    const completed = await transitionPersistedAgentHandoff(db, {
      userId: first.user.id,
      id: saved.id,
      event: { type: "APPLY", occurredAt: new Date(now.getTime() + 61_000).toISOString() },
    });
    expect(completed.record?.status).toBe("completed");
    expect(completed.authorityChange).toMatchObject({ handoffId: saved.id, fromAgentId: "zen_deer", toAgentId: "bird_courier" });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: first.conversation.id } })).activeAgentId).toBe("zen_deer");

    await db.anonymousUser.delete({ where: { id: first.user.id } });
    expect(await db.agentHandoff.count({ where: { id: saved.id } })).toBe(0);
  });

  it("physically removes expired proposals and completed receipts", async () => {
    const owner = await createUser("CLEANUP");
    const now = new Date();
    const expiredProposal = proposal(`${researchPrefix}_expired`, new Date(now.getTime() - 16 * 60 * 1000));
    await persistAgentHandoffProposal(db, {
      userId: owner.user.id,
      conversationId: owner.conversation.id,
      proposal: expiredProposal,
      now: new Date(Date.parse(expiredProposal.createdAt) + 1_000),
    });
    expect(await cleanupExpiredAgentHandoffs(db, now)).toBe(1);
    expect(await db.agentHandoff.count({ where: { id: expiredProposal.id } })).toBe(0);

    const completedProposal = proposal(`${researchPrefix}_completed`, now);
    await persistAgentHandoffProposal(db, { userId: owner.user.id, conversationId: owner.conversation.id, proposal: completedProposal });
    const authorizedAt = new Date(now.getTime() + 1_000);
    await transitionPersistedAgentHandoff(db, { userId: owner.user.id, id: completedProposal.id, event: { type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: authorizedAt.toISOString() } });
    await transitionPersistedAgentHandoff(db, { userId: owner.user.id, id: completedProposal.id, event: { type: "APPLY", occurredAt: new Date(now.getTime() + 2_000).toISOString() } });
    expect(await cleanupExpiredAgentHandoffs(db, new Date(authorizedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - 1))).toBe(0);
    expect(await cleanupExpiredAgentHandoffs(db, new Date(authorizedAt.getTime() + 30 * 24 * 60 * 60 * 1000))).toBe(1);
  });
});
