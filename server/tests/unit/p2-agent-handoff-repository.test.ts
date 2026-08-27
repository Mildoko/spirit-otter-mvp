import type { AgentHandoff, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  cleanupExpiredAgentHandoffs,
  findAgentHandoffForUser,
  persistAgentHandoffProposal,
  transitionPersistedAgentHandoff,
} from "../../src/modules/p2/agent-handoff-repository.js";

const baseTime = new Date("2026-08-27T10:00:00.000Z");

function proposal(id = "handoff_01") {
  return {
    schemaVersion: 1 as const,
    id,
    status: "proposed" as const,
    fromAgentId: "zen_deer" as const,
    toAgentId: "bird_courier" as const,
    initiatedBy: "agent" as const,
    reason: "capability_match" as const,
    context: { focus: "practical_planning" as const, publicItemId: null, actionId: null, followupId: null },
    createdAt: baseTime.toISOString(),
    expiresAt: new Date(baseTime.getTime() + 15 * 60 * 1000).toISOString(),
  };
}

function createFakeDb(activeAgentId = "zen_deer") {
  const rows = new Map<string, AgentHandoff>();
  const fake = {
    conversation: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => where.id === "conversation_01" && where.userId === "user_01"
        ? { id: where.id, activeAgentId }
        : null,
    },
    actionItem: { findFirst: async () => null },
    followupTask: { findFirst: async () => null },
    agentHandoff: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          authorization: null,
          authorizedAt: null,
          completedAt: null,
          updatedAt: data.createdAt as Date,
          ...data,
          status: "proposed",
        } as AgentHandoff;
        rows.set(row.id, row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = rows.get(where.id);
        return row?.userId === where.userId ? row : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; userId: string; status: string }; data: Partial<AgentHandoff> }) => {
        const row = rows.get(where.id);
        if (!row || row.userId !== where.userId || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        if (!row) throw new Error("not found");
        return row;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === "string") {
          const row = rows.get(where.id);
          if (!row || row.userId !== where.userId || row.status !== where.status) return { count: 0 };
          rows.delete(where.id);
          return { count: 1 };
        }
        const now = ((where.OR as Array<Record<string, unknown>>)[0]?.expiresAt as { lte: Date }).lte;
        let count = 0;
        for (const [id, row] of rows) {
          if (row.expiresAt <= now || (["proposed", "authorized"].includes(row.status) && row.proposalExpiresAt <= now)) {
            rows.delete(id);
            count += 1;
          }
        }
        return { count };
      },
    },
    $transaction: async (operation: (tx: unknown) => unknown) => operation(fake),
  };
  return { db: fake as unknown as PrismaClient, rows };
}

describe("P2 agent handoff repository", () => {
  it("stores structured fields and isolates reads by user", async () => {
    const { db } = createFakeDb();
    const saved = await persistAgentHandoffProposal(db, {
      userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: baseTime,
    });
    expect(saved).toMatchObject({ status: "proposed", focus: "practical_planning", authorization: null });
    expect(saved).not.toHaveProperty("content");
    expect(saved).not.toHaveProperty("contextJson");
    expect(await findAgentHandoffForUser(db, "user_02", saved.id)).toBeNull();
  });

  it("rejects stale proposals and a source that is no longer active", async () => {
    const stale = createFakeDb();
    await expect(persistAgentHandoffProposal(stale.db, {
      userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: new Date("2026-08-27T10:15:00.000Z"),
    })).rejects.toMatchObject({ code: "HANDOFF_PROPOSAL_EXPIRED" });

    const switched = createFakeDb("spirit_otter");
    await expect(persistAgentHandoffProposal(switched.db, {
      userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: baseTime,
    })).rejects.toMatchObject({ code: "HANDOFF_SOURCE_NOT_ACTIVE" });
  });

  it("persists authorization and completion without changing conversation authority", async () => {
    const { db } = createFakeDb();
    await persistAgentHandoffProposal(db, { userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: baseTime });
    const authorized = await transitionPersistedAgentHandoff(db, {
      userId: "user_01", id: "handoff_01",
      event: { type: "USER_CONFIRM", authorization: "explicit_user_confirm", occurredAt: "2026-08-27T10:01:00.000Z" },
    });
    expect(authorized.record).toMatchObject({ status: "authorized", authorization: "explicit_user_confirm" });
    const completed = await transitionPersistedAgentHandoff(db, {
      userId: "user_01", id: "handoff_01", event: { type: "APPLY", occurredAt: "2026-08-27T10:01:01.000Z" },
    });
    expect(completed.record?.status).toBe("completed");
    expect(completed.authorityChange).toMatchObject({ fromAgentId: "zen_deer", toAgentId: "bird_courier" });
  });

  it("physically deletes rejected and expired proposal records", async () => {
    const rejected = createFakeDb();
    await persistAgentHandoffProposal(rejected.db, { userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: baseTime });
    expect((await transitionPersistedAgentHandoff(rejected.db, {
      userId: "user_01", id: "handoff_01", event: { type: "USER_REJECT", occurredAt: "2026-08-27T10:01:00.000Z" },
    })).record).toBeNull();
    expect(rejected.rows.size).toBe(0);

    const expired = createFakeDb();
    await persistAgentHandoffProposal(expired.db, { userId: "user_01", conversationId: "conversation_01", proposal: proposal(), now: baseTime });
    expect(await cleanupExpiredAgentHandoffs(expired.db, new Date("2026-08-27T10:15:00.000Z"))).toBe(1);
    expect(expired.rows.size).toBe(0);
  });
});
