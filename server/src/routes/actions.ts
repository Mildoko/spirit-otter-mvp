import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logBehavior } from "../services/behavior-service.js";
import { addDays } from "../utils.js";

const idParams = z.object({ id: z.string() });
const confirmSchema = z.object({
  decision: z.enum(["confirm", "abandon"]),
  text: z.string().trim().min(1).max(240).optional(),
});
const actionStatusSchema = z.object({ status: z.enum(["completed", "deferred", "deleted"]) });

export function registerActionRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/actions/:id/confirm", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = idParams.parse(request.params);
    const body = confirmSchema.parse(request.body);
    const action = await db.actionItem.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!action) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "行动不存在" } });
    if (action.status !== "draft") return reply.code(409).send({ error: { code: "ACTION_CLOSED", message: "行动已经处理" } });

    const updated = await db.$transaction(async (tx) => {
      const item = await tx.actionItem.update({
        where: { id },
        data: body.decision === "confirm"
          ? { status: "confirmed", confirmedAt: new Date(), text: body.text ?? action.text, expiresAt: addDays(new Date(), RECORD_DAYS) }
          : { status: "deleted", expiresAt: addDays(new Date(), RECORD_DAYS) },
      });
      await logBehavior(tx, auth.userId, body.decision === "confirm" ? "action_confirmed" : "action_deleted", { actionId: id });
      return item;
    });
    return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
  });

  app.patch("/api/actions/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = idParams.parse(request.params);
    const { status } = actionStatusSchema.parse(request.body);
    const action = await db.actionItem.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!action || action.status === "draft" || action.status === "deleted") {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "可更新的行动不存在" } });
    }
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.actionItem.update({
        where: { id },
        data: {
          status,
          ...(status === "completed" ? { completedAt: new Date() } : {}),
          expiresAt: addDays(new Date(), RECORD_DAYS),
        },
      });
      await logBehavior(tx, auth.userId, `action_${status}`, { actionId: id });
      return item;
    });
    return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
  });
}
