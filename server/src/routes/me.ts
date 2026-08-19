import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../config/env.js";
import { SESSION_COOKIE } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { z } from "zod";
import { decideMemory, decideRelation, deleteMemory, deleteRelation, listMemories } from "../modules/memory/management.js";

const memoryStatusSchema = z.enum(["active", "disabled", "rejected", "superseded", "expired", "deleted"]);
const memoryDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["confirm", "disable", "enable", "reject"]) }).strict(),
  z.object({ action: z.literal("correct"), content: z.string().trim().min(3).max(240), structuredValue: z.string().trim().max(160).optional() }).strict(),
]);
const relationDecisionSchema = z.object({ action: z.enum(["confirm", "disable", "enable", "reject"]) }).strict();

export function registerMeRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.get("/api/me/memories", async (request) => {
    const auth = await requireAuth(request, db, env);
    const query = z.object({ status: memoryStatusSchema.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }).parse(request.query);
    return listMemories(db, auth.userId, query);
  });

  app.patch("/api/me/memories/:id", async (request) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return decideMemory(db, auth.userId, id, memoryDecisionSchema.parse(request.body));
  });

  app.delete("/api/me/memories/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await deleteMemory(db, auth.userId, id);
    return reply.code(204).send();
  });

  app.patch("/api/me/memory-relations/:id", async (request) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return decideRelation(db, auth.userId, id, relationDecisionSchema.parse(request.body));
  });

  app.delete("/api/me/memory-relations/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await deleteRelation(db, auth.userId, id);
    return reply.code(204).send();
  });

  app.get("/api/me/export", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const [conversations, memories] = await Promise.all([
      db.conversation.findMany({
        where: { userId: auth.userId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          actionItems: { where: { status: { not: "deleted" } }, orderBy: { createdAt: "asc" } },
          followups: { where: { status: { not: "deleted" } }, orderBy: { createdAt: "asc" } },
        },
      }),
      db.memoryItem.findMany({
        where: { userId: auth.userId, status: { not: "deleted" } },
        include: {
          evidence: { select: { excerpt: true, capturedAt: true } },
          revisions: { select: { previousContent: true, previousStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          outgoingRelations: { select: { id: true, targetMemoryId: true, type: true, claimState: true, status: true, confidence: true, evidence: true, observedAt: true, validFrom: true, validTo: true } },
        },
        orderBy: { observedAt: "asc" },
      }),
    ]);
    reply.header("Content-Disposition", `attachment; filename=spirit-otter-${auth.researchId}.json`);
    return {
      exportedAt: new Date().toISOString(),
      researchId: auth.researchId,
      notice: "此导出不包含内部风险判断和策略推理。云端模型供应商的数据保留不受此文件控制。",
      memories: memories.map((memory) => ({
        id: memory.id,
        type: memory.kind,
        content: memory.content,
        source: memory.origin,
        claimState: memory.claimState,
        status: memory.status,
        observedAt: memory.observedAt,
        eventAt: memory.eventAt,
        validFrom: memory.validFrom,
        validTo: memory.validTo,
        expiresAt: memory.expiresAt,
        evidence: memory.evidence,
        relations: memory.outgoingRelations,
        revisions: memory.revisions,
      })),
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        messages: conversation.messages.map(({ id, role, content, createdAt }) => ({ id, role, content, createdAt })),
        actions: conversation.actionItems.map(({ id, text, status, createdAt, updatedAt }) => ({ id, text, status, createdAt, updatedAt })),
        followups: conversation.followups.map(({ id, actionId, dueAt, status, createdAt }) => ({ id, actionId, dueAt, status, createdAt })),
      })),
    };
  });

  app.delete("/api/me/data", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    await db.anonymousUser.delete({ where: { id: auth.userId } });
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });
}
