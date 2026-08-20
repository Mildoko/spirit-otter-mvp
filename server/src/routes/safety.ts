import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { requireAuth } from "../services/session-service.js";
import { logCoreDialogueEvent } from "../services/behavior-service.js";

export function registerSafetyRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/safety-events/:turnId/request-help", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { turnId } = z.object({ turnId: z.string() }).parse(request.params);
    const event = await db.safetyEvent.findFirst({
      where: { turnId, conversation: { userId: auth.userId } },
    });
    if (!event) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "安全事件不存在" } });
    await db.$transaction(async (tx) => {
      await tx.safetyEvent.update({ where: { id: event.id }, data: { researcherHelpRequestedAt: new Date() } });
      await logCoreDialogueEvent(tx, auth.userId, {
        eventName: "safety_help_requested",
        eventKey: `turn:${turnId}:safety_help_requested`,
        metadata: { sessionId: auth.sessionId, conversationId: event.conversationId, turnId, helpType: "contact_person" },
      });
    });
    return { requested: true, contact: env.RESEARCH_CONTACT };
  });
}
