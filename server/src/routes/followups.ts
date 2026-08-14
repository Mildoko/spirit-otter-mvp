import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logBehavior } from "../services/behavior-service.js";
import { addDays } from "../utils.js";

const createSchema = z.object({
  actionId: z.string(),
  dueAt: z.coerce.date(),
  authorized: z.literal(true),
});
const patchSchema = z.object({ status: z.enum(["completed", "deferred", "closed", "deleted"]) });

export function registerFollowupRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/followups", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const body = createSchema.parse(request.body);
    const now = new Date();
    if (body.dueAt <= now || body.dueAt > addDays(now, 14)) {
      return reply.code(400).send({ error: { code: "INVALID_DUE_AT", message: "回访时间需在未来14天内" } });
    }
    const action = await db.actionItem.findFirst({
      where: { id: body.actionId, status: "confirmed", conversation: { userId: auth.userId } },
    });
    if (!action) return reply.code(400).send({ error: { code: "ACTION_NOT_CONFIRMED", message: "只能为已确认行动创建回访" } });
    const followup = await db.$transaction(async (tx) => {
      const item = await tx.followupTask.create({
        data: {
          conversationId: action.conversationId,
          actionId: action.id,
          dueAt: body.dueAt,
          expiresAt: addDays(now, RECORD_DAYS),
        },
      });
      await logBehavior(tx, auth.userId, "followup_created", { followupId: item.id, actionId: action.id });
      return item;
    });
    return reply.code(201).send({ ...followup, dueAt: followup.dueAt.toISOString() });
  });

  app.patch("/api/followups/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = patchSchema.parse(request.body);
    const followup = await db.followupTask.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!followup || ["closed", "deleted"].includes(followup.status)) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "回访不存在" } });
    }
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.followupTask.update({
        where: { id },
        data: { status, expiresAt: addDays(new Date(), RECORD_DAYS) },
      });
      await logBehavior(tx, auth.userId, `followup_${status}`, { followupId: id });
      return item;
    });
    return { ...updated, dueAt: updated.dueAt.toISOString() };
  });
}
