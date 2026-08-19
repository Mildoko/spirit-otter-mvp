import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { MemoryDecisionV2, MemoryRelationDecisionV1, PublicMemoryPageV2, PublicMemoryRelationV1, PublicMemoryV2 } from "@otter/shared";
import { addDays } from "../../utils.js";
import { RECORD_DAYS } from "../../config/constants.js";

type MemoryWithGraph = Prisma.MemoryItemGetPayload<{
  include: {
    evidence: true;
    outgoingRelations: { include: { sourceMemory: true; targetMemory: true } };
    incomingRelations: { include: { sourceMemory: true; targetMemory: true } };
  };
}>;

const graphInclude = {
  evidence: { orderBy: { capturedAt: "asc" as const } },
  outgoingRelations: { include: { sourceMemory: true, targetMemory: true } },
  incomingRelations: { include: { sourceMemory: true, targetMemory: true } },
} as const;

function relationPublic(relation: MemoryWithGraph["outgoingRelations"][number]): PublicMemoryRelationV1 {
  return {
    id: relation.id,
    type: relation.type,
    sourceMemoryId: relation.sourceMemoryId,
    targetMemoryId: relation.targetMemoryId,
    sourceContent: relation.sourceMemory.content,
    targetContent: relation.targetMemory.content,
    claimState: relation.claimState,
    status: relation.status,
    confidence: relation.confidence,
    observedAt: relation.observedAt.toISOString(),
  };
}

export function publicMemoryV2(item: MemoryWithGraph): PublicMemoryV2 {
  const relations = [...item.outgoingRelations, ...item.incomingRelations]
    .filter((relation, index, all) => all.findIndex((candidate) => candidate.id === relation.id) === index)
    .map(relationPublic);
  return {
    schemaVersion: 2,
    id: item.id,
    kind: item.kind,
    content: item.content,
    ...(item.structuredValue ? { structuredValue: item.structuredValue } : {}),
    claimState: item.claimState,
    status: item.status,
    observedAt: item.observedAt.toISOString(),
    ...(item.eventAt ? { eventAt: item.eventAt.toISOString() } : {}),
    validFrom: item.validFrom.toISOString(),
    ...(item.validTo ? { validTo: item.validTo.toISOString() } : {}),
    evidence: item.evidence.map((evidence) => ({ excerpt: evidence.excerpt, capturedAt: evidence.capturedAt.toISOString() })),
    relations,
  };
}

export async function listMemories(db: PrismaClient, userId: string, input: { status?: PublicMemoryV2["status"] | undefined; cursor?: string | undefined; limit: number }): Promise<PublicMemoryPageV2> {
  const rows = await db.memoryItem.findMany({
    where: { userId, ...(input.status ? { status: input.status } : { status: { not: "deleted" } }) },
    include: graphInclude,
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1,
  });
  const hasMore = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  return { items: page.map(publicMemoryV2), ...(hasMore ? { nextCursor: page.at(-1)?.id } : {}) };
}

function notFound(): never {
  throw Object.assign(new Error("记忆不存在"), { statusCode: 404, code: "NOT_FOUND" });
}

export async function decideMemory(db: PrismaClient, userId: string, id: string, decision: MemoryDecisionV2): Promise<PublicMemoryV2> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const current = await tx.memoryItem.findFirst({ where: { id, userId } });
    if (!current) notFound();
    if (decision.action === "confirm") {
      await tx.memoryItem.update({ where: { id }, data: { claimState: "confirmed", status: "active", reviewExpiresAt: null } });
    } else if (decision.action === "disable") {
      await tx.memoryItem.update({ where: { id }, data: { status: "disabled" } });
    } else if (decision.action === "enable") {
      await tx.memoryItem.update({ where: { id }, data: { status: "active" } });
    } else if (decision.action === "reject") {
      await tx.memoryItem.update({ where: { id }, data: { status: "rejected", validTo: now } });
      await tx.memoryRelation.updateMany({ where: { userId, OR: [{ sourceMemoryId: id }, { targetMemoryId: id }] }, data: { status: "rejected", validTo: now } });
    } else {
      const content = decision.content.trim();
      const hash = createHash("sha256").update(`${current.kind}|${content.toLowerCase()}`).digest("hex");
      await tx.memoryRevision.create({ data: { memoryId: current.id, previousContent: current.content, previousStatus: current.status, reason: "corrected_by_user" } });
      await tx.memoryItem.update({ where: { id }, data: { status: "superseded", validTo: now } });
      await tx.memoryRelation.updateMany({ where: { userId, OR: [{ sourceMemoryId: id }, { targetMemoryId: id }] }, data: { status: "expired", validTo: now } });
      const replacement = await tx.memoryItem.create({ data: {
        userId, conversationId: current.conversationId, kind: current.kind, content,
        structuredKey: current.structuredKey,
        ...(decision.structuredValue !== undefined ? { structuredValue: decision.structuredValue.trim() || null } : { structuredValue: current.structuredValue }),
        contentHash: hash, origin: "user_explicit", sensitivity: current.sensitivity,
        importance: Math.max(current.importance, 0.9), confidence: 1, claimState: "confirmed",
        observedAt: now, eventAt: current.eventAt, validFrom: now, expiresAt: addDays(now, RECORD_DAYS),
        supersedesId: current.id, schemaVersion: 2,
        evidence: { create: { speaker: "user", excerpt: content, capturedAt: now } },
      } });
      id = replacement.id;
    }
  });
  const updated = await db.memoryItem.findFirst({ where: { id, userId }, include: graphInclude });
  if (!updated) return notFound();
  return publicMemoryV2(updated);
}

export async function deleteMemory(db: PrismaClient, userId: string, id: string): Promise<void> {
  const deleted = await db.memoryItem.deleteMany({ where: { id, userId } });
  if (!deleted.count) notFound();
}

export async function decideRelation(db: PrismaClient, userId: string, id: string, decision: MemoryRelationDecisionV1): Promise<PublicMemoryRelationV1> {
  const relation = await db.memoryRelation.findFirst({ where: { id, userId } });
  if (!relation) notFound();
  const now = new Date();
  const data = decision.action === "confirm" ? { claimState: "confirmed" as const, status: "active" as const, reviewExpiresAt: null }
    : decision.action === "disable" ? { status: "disabled" as const }
      : decision.action === "enable" ? { status: "active" as const }
        : { status: "rejected" as const, validTo: now };
  const updated = await db.memoryRelation.update({ where: { id }, data, include: { sourceMemory: true, targetMemory: true } });
  return relationPublic(updated);
}

export async function deleteRelation(db: PrismaClient, userId: string, id: string): Promise<void> {
  const deleted = await db.memoryRelation.deleteMany({ where: { id, userId } });
  if (!deleted.count) notFound();
}
