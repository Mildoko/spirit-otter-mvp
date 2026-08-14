import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MemoryCandidate, PromptMemory } from "@otter/shared";
import { addDays } from "../../utils.js";
import { RECORD_DAYS } from "../../config/constants.js";
import { applyMemoryBudget, rankMemories, type RecallCandidate } from "./ranker.js";
import { filterMemoryCandidates } from "./guard.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

function contentHash(candidate: MemoryCandidate): string {
  return createHash("sha256").update(`${candidate.kind}|${candidate.content.trim().toLowerCase()}`).digest("hex");
}

export async function persistMemoryCandidates(db: DbClient, input: {
  userId: string;
  conversationId: string;
  messageId: string;
  userText: string;
  candidates: MemoryCandidate[];
  now?: Date;
}): Promise<string[]> {
  const now = input.now ?? new Date();
  const saved: string[] = [];
  for (const candidate of filterMemoryCandidates(input.candidates, input.userText)) {
    const hash = contentHash(candidate);
    const duplicate = await db.memoryItem.findFirst({ where: { userId: input.userId, contentHash: hash, status: "active" } });
    if (duplicate) continue;
    const replaceable = ["user_preference", "boundary", "support_strategy", "user_fact"].includes(candidate.kind);
    const previous = replaceable
      ? await db.memoryItem.findFirst({ where: { userId: input.userId, kind: candidate.kind, structuredKey: candidate.structuredKey, status: "active" }, orderBy: { updatedAt: "desc" } })
      : null;
    if (previous) {
      await db.memoryRevision.create({ data: { memoryId: previous.id, previousContent: previous.content, previousStatus: previous.status, reason: "superseded_by_new_evidence" } });
      await db.memoryItem.update({ where: { id: previous.id }, data: { status: "superseded" } });
    }
    const item = await db.memoryItem.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        kind: candidate.kind,
        content: candidate.content,
        structuredKey: candidate.structuredKey,
        ...(candidate.structuredValue !== undefined ? { structuredValue: candidate.structuredValue } : {}),
        contentHash: hash,
        origin: candidate.origin,
        sensitivity: candidate.sensitivity,
        importance: candidate.importance,
        confidence: candidate.confidence,
        observedAt: now,
        validFrom: now,
        expiresAt: addDays(now, RECORD_DAYS),
        ...(previous ? { supersedesId: previous.id } : {}),
        evidence: { create: { messageId: input.messageId, speaker: "user", excerpt: candidate.evidence, capturedAt: now } },
      },
    });
    saved.push(item.id);
  }
  return saved;
}

export async function recallMemories(db: DbClient, userId: string, query: string, now = new Date()): Promise<PromptMemory[]> {
  const rows = await db.memoryItem.findMany({
    where: { userId, status: "active", expiresAt: { gt: now }, sensitivity: { in: ["normal", "personal"] } },
    orderBy: { observedAt: "desc" },
    take: 50,
  });
  const candidates: RecallCandidate[] = rows.map((item) => ({
    id: item.id,
    kind: item.kind,
    content: item.content,
    observedAt: item.observedAt.toISOString(),
    relevanceNote: ["boundary", "user_preference", "support_strategy"].includes(item.kind)
      ? "current_preference"
      : item.kind === "relationship_milestone" ? "relationship_context" : "historical_event",
    structuredKey: item.structuredKey,
    importance: item.importance,
    observedAtDate: item.observedAt,
  }));
  return applyMemoryBudget(rankMemories(candidates, query));
}

export async function markMemoriesRecalled(db: DbClient, ids: string[], now = new Date()): Promise<void> {
  if (!ids.length) return;
  await db.memoryItem.updateMany({ where: { id: { in: ids }, status: "active" }, data: { recallCount: { increment: 1 }, lastRecalledAt: now } });
}
