import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MemoryCandidate, MemoryRelationCandidateV1, PromptMemory } from "@otter/shared";
import { addDays } from "../../utils.js";
import { RECORD_DAYS } from "../../config/constants.js";
import { applyMemoryBudget, rankMemories, type RecallCandidate } from "./ranker.js";
import { filterMemoryCandidates, filterMemoryRelationCandidates } from "./guard.js";
import { resolveEventTime } from "./temporal.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const contentHash = (candidate: MemoryCandidate) => digest(`${candidate.kind}|${candidate.content.trim().toLowerCase()}`);
const relationFingerprint = (candidate: MemoryRelationCandidateV1) => digest(`${candidate.sourceKey}|${candidate.type}|${candidate.targetKey}`);

export interface PersistMemoryResult { memoryIds: string[]; relationIds: string[] }

export async function persistMemoryCandidates(db: DbClient, input: {
  userId: string; conversationId: string; messageId: string; userText: string;
  candidates: MemoryCandidate[]; relations?: MemoryRelationCandidateV1[]; memoryV2Enabled?: boolean; now?: Date;
}): Promise<string[]> {
  return (await persistMemoryGraph(db, input)).memoryIds;
}

export async function persistMemoryGraph(db: DbClient, input: {
  userId: string; conversationId: string; messageId: string; userText: string;
  candidates: MemoryCandidate[]; relations?: MemoryRelationCandidateV1[]; memoryV2Enabled?: boolean; now?: Date;
}): Promise<PersistMemoryResult> {
  const now = input.now ?? new Date();
  const memoryIds: string[] = [];
  const relationIds: string[] = [];
  const resolvedByKey = new Map<string, { id: string; userId: string }>();
  for (const candidate of filterMemoryCandidates(input.candidates, input.userText)) {
    const hash = contentHash(candidate);
    const blocked = input.memoryV2Enabled
      ? await db.memoryItem.findFirst({ where: { userId: input.userId, contentHash: hash, status: "rejected" }, select: { id: true } })
      : null;
    if (blocked) continue;
    const duplicate = await db.memoryItem.findFirst({ where: { userId: input.userId, contentHash: hash, status: "active" } });
    if (duplicate) { resolvedByKey.set(candidate.structuredKey, duplicate); continue; }
    const replaceable = ["user_preference", "boundary", "support_strategy", "user_fact"].includes(candidate.kind);
    const previous = replaceable
      ? await db.memoryItem.findFirst({ where: { userId: input.userId, kind: candidate.kind, structuredKey: candidate.structuredKey, status: "active" }, orderBy: { updatedAt: "desc" } })
      : null;
    if (previous) {
      await db.memoryRevision.create({ data: { memoryId: previous.id, previousContent: previous.content, previousStatus: previous.status, reason: "superseded_by_new_evidence" } });
      await db.memoryItem.update({ where: { id: previous.id }, data: { status: "superseded", ...(input.memoryV2Enabled ? { validTo: now } : {}) } });
    }
    const hypothesis = Boolean(input.memoryV2Enabled && candidate.origin === "model_inference");
    const eventAt = input.memoryV2Enabled ? resolveEventTime(candidate.eventTimeText, now) : undefined;
    const item = await db.memoryItem.create({
      data: {
        userId: input.userId, conversationId: input.conversationId, kind: candidate.kind, content: candidate.content,
        structuredKey: candidate.structuredKey,
        ...(candidate.structuredValue !== undefined ? { structuredValue: candidate.structuredValue } : {}),
        contentHash: hash, origin: candidate.origin, sensitivity: candidate.sensitivity,
        importance: candidate.importance, confidence: candidate.confidence,
        claimState: hypothesis ? "hypothesis" : "asserted", observedAt: now,
        ...(eventAt ? { eventAt } : {}), validFrom: now,
        ...(hypothesis ? { reviewExpiresAt: addDays(now, 7) } : {}),
        expiresAt: addDays(now, RECORD_DAYS), schemaVersion: input.memoryV2Enabled ? 2 : 1,
        ...(previous ? { supersedesId: previous.id } : {}),
        evidence: { create: { messageId: input.messageId, speaker: "user", excerpt: candidate.evidence, capturedAt: now } },
      },
    });
    memoryIds.push(item.id);
    resolvedByKey.set(candidate.structuredKey, item);
  }

  if (!input.memoryV2Enabled) return { memoryIds, relationIds };
  const relationCandidates = filterMemoryRelationCandidates(input.relations ?? [], input.userText);
  const unresolvedKeys = [...new Set(relationCandidates.flatMap((candidate) => [candidate.sourceKey, candidate.targetKey]).filter((key) => !resolvedByKey.has(key)))];
  if (unresolvedKeys.length) {
    const existing = await db.memoryItem.findMany({
      where: { userId: input.userId, structuredKey: { in: unresolvedKeys }, status: "active", expiresAt: { gt: now } },
      orderBy: { updatedAt: "desc" },
    });
    for (const item of existing) if (!resolvedByKey.has(item.structuredKey)) resolvedByKey.set(item.structuredKey, item);
  }
  for (const candidate of relationCandidates) {
    const source = resolvedByKey.get(candidate.sourceKey);
    const target = resolvedByKey.get(candidate.targetKey);
    if (!source || !target || source.userId !== input.userId || target.userId !== input.userId) continue;
    const fingerprintHash = relationFingerprint(candidate);
    const existing = await db.memoryRelation.findFirst({ where: { userId: input.userId, fingerprintHash, status: { in: ["active", "rejected"] } } });
    if (existing) continue;
    const hypothesis = candidate.origin === "model_inference";
    const relation = await db.memoryRelation.create({ data: {
      userId: input.userId, sourceMemoryId: source.id, targetMemoryId: target.id, type: candidate.type,
      origin: candidate.origin, claimState: hypothesis ? "hypothesis" : "asserted", confidence: candidate.confidence,
      evidence: candidate.evidence, fingerprintHash, observedAt: now, validFrom: now,
      ...(hypothesis ? { reviewExpiresAt: addDays(now, 7) } : {}), expiresAt: addDays(now, RECORD_DAYS),
    } });
    relationIds.push(relation.id);
  }
  return { memoryIds, relationIds };
}

function relevanceNote(kind: RecallCandidate["kind"]): PromptMemory["relevanceNote"] {
  return ["boundary", "user_preference", "support_strategy"].includes(kind)
    ? "current_preference" : kind === "relationship_milestone" ? "relationship_context" : "historical_event";
}

export async function recallMemories(db: DbClient, userId: string, query: string, now = new Date(), memoryV2Enabled = false): Promise<PromptMemory[]> {
  const rows = await db.memoryItem.findMany({
    where: {
      userId, status: "active", expiresAt: { gt: now }, sensitivity: { in: ["normal", "personal"] },
      ...(memoryV2Enabled ? { AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }, { OR: [{ reviewExpiresAt: null }, { reviewExpiresAt: { gt: now } }] }] } : {}),
    },
    orderBy: { observedAt: "desc" }, take: 50,
  });
  const candidates: RecallCandidate[] = rows.map((item) => ({
    id: item.id, kind: item.kind, content: item.content, observedAt: item.observedAt.toISOString(),
    relevanceNote: relevanceNote(item.kind), structuredKey: item.structuredKey, importance: item.importance,
    observedAtDate: item.observedAt, claimState: item.claimState,
  }));
  const direct = rankMemories(candidates, query).slice(0, memoryV2Enabled ? 4 : 50);
  if (!memoryV2Enabled || !direct.length) return applyMemoryBudget(direct);

  const directIds = new Set(direct.map((item) => item.id));
  const relations = await db.memoryRelation.findMany({
    where: {
      userId, status: "active", expiresAt: { gt: now },
      OR: [{ sourceMemoryId: { in: [...directIds] } }, { targetMemoryId: { in: [...directIds] } }],
      AND: [
        { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        { OR: [{ reviewExpiresAt: null }, { reviewExpiresAt: { gt: now } }] },
        { OR: [{ claimState: { not: "hypothesis" } }, { presentedAt: null }] },
      ],
    },
    include: { sourceMemory: true, targetMemory: true }, orderBy: [{ confidence: "desc" }, { observedAt: "desc" }], take: 8,
  });
  const linked: RecallCandidate[] = [];
  for (const relation of relations) {
    const seedIsSource = directIds.has(relation.sourceMemoryId);
    const target = seedIsSource ? relation.targetMemory : relation.sourceMemory;
    if (directIds.has(target.id)) {
      const directTarget = direct.find((item) => item.id === target.id);
      if (directTarget && !directTarget.relationNote) {
        directTarget.relationNote = `${relation.claimState === "hypothesis" ? "未确认推测关系：" : "已知关系："}${seedIsSource ? relation.sourceMemory.content : relation.targetMemory.content} ${relation.type} ${target.content}`;
        if (relation.claimState === "hypothesis") directTarget.relationId = relation.id;
      }
      continue;
    }
    if (linked.some((item) => item.id === target.id)) continue;
    linked.push({
      id: target.id, kind: target.kind, content: target.content, observedAt: target.observedAt.toISOString(),
      relevanceNote: "relationship_context", structuredKey: target.structuredKey,
      importance: target.importance * (relation.claimState === "hypothesis" ? 0.75 : 1), observedAtDate: target.observedAt,
      claimState: target.claimState,
      relationNote: `${relation.claimState === "hypothesis" ? "未确认推测关系：" : "已知关系："}${seedIsSource ? relation.sourceMemory.content : relation.targetMemory.content} ${relation.type} ${target.content}`,
      ...(relation.claimState === "hypothesis" ? { relationId: relation.id } : {}),
    });
    if (linked.length >= 2) break;
  }
  return applyMemoryBudget([...direct, ...linked]);
}

export async function markMemoryRelationsPresented(db: DbClient, ids: string[], now = new Date()): Promise<void> {
  if (!ids.length) return;
  await db.memoryRelation.updateMany({ where: { id: { in: ids }, claimState: "hypothesis", presentedAt: null }, data: { presentedAt: now, presentationCount: { increment: 1 } } });
}

export async function markMemoriesRecalled(db: DbClient, ids: string[], now = new Date()): Promise<void> {
  if (!ids.length) return;
  await db.memoryItem.updateMany({ where: { id: { in: ids }, status: "active" }, data: { recallCount: { increment: 1 }, lastRecalledAt: now } });
}
