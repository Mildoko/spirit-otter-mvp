import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { requireAuth } from "../services/session-service.js";
import { logBehavior } from "../services/behavior-service.js";

const decisionSchema = z.object({ decision: z.enum(["accept", "decline"]) });

export function registerModeTransitionRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/mode-transitions/:id/respond", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { decision } = decisionSchema.parse(request.body);
    const transition = await db.modeTransition.findFirst({
      where: { id, conversation: { userId: auth.userId } },
      include: { conversation: true },
    });
    if (!transition) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "模式邀请不存在" } });
    if (transition.status !== "pending" || transition.expiresAt <= new Date()) {
      return reply.code(409).send({ error: { code: "TRANSITION_CLOSED", message: "这个模式邀请已经结束" } });
    }
    await db.$transaction(async (tx) => {
      await tx.modeTransition.update({
        where: { id },
        data: { status: decision === "accept" ? "accepted" : "declined", respondedAt: new Date() },
      });
      if (decision === "accept") {
        await tx.conversation.update({ where: { id: transition.conversationId }, data: { mode: transition.targetMode } });
      }
      await logBehavior(tx, auth.userId, decision === "accept" ? "mode_accepted" : "mode_declined", { transitionId: id });
    });
    return { mode: decision === "accept" ? transition.targetMode : transition.conversation.mode };
  });
}
