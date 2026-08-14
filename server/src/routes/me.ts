import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../config/env.js";
import { SESSION_COOKIE } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";

export function registerMeRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
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
        include: { evidence: { select: { excerpt: true, capturedAt: true } } },
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
        status: memory.status,
        observedAt: memory.observedAt,
        expiresAt: memory.expiresAt,
        evidence: memory.evidence,
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
