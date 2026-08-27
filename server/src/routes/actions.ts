import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logCoreDialogueEvent } from "../services/behavior-service.js";
import { addDays } from "../utils.js";
import type { AiTelemetry } from "../observability/ai-telemetry.js";
import { resolveActionTransition } from "../state-machines/action-transition.js";

const idParams = z.object({ id: z.string() });
const confirmSchema = z.object({
  decision: z.enum(["confirm", "abandon"]),
  text: z.string().trim().min(1).max(240).optional(),
});
const actionStatusSchema = z.object({ status: z.enum(["completed", "deferred", "deleted"]) });

export function registerActionRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv, telemetry?: AiTelemetry): void {
  app.post("/api/actions/:id/confirm", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = idParams.parse(request.params);
    const body = confirmSchema.parse(request.body);
    const action = await db.actionItem.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!action) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "行动不存在" } });
    const transition = resolveActionTransition({ mode: env.ACTION_ENGINE_MODE, status: action.status, event: { type: body.decision === "confirm" ? "CONFIRM" : "ABANDON" }, telemetry });
    if (!transition.accepted) return reply.code(409).send({ error: { code: "ACTION_CLOSED", message: "行动已经处理" } });

    const updated = await db.$transaction(async (tx) => {
      const item = await tx.actionItem.update({
        where: { id },
        data: body.decision === "confirm"
          ? { status: transition.state, confirmedAt: new Date(), text: body.text ?? action.text, expiresAt: addDays(new Date(), RECORD_DAYS) }
          : { status: transition.state, expiresAt: addDays(new Date(), RECORD_DAYS) },
      });
      if (body.decision === "confirm") {
        const edited = Boolean(body.text && body.text !== action.text);
        if (edited) {
          await logCoreDialogueEvent(tx, auth.userId, {
            eventName: "action_edited",
            eventKey: `action:${id}:action_edited:user_confirm`,
            metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id, editedBy: "user", editReason: "rewrite" },
          });
        }
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "action_confirmed",
          eventKey: `action:${id}:action_confirmed`,
          metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id, confirmationType: "ui_confirm", edited },
        });
      } else {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "action_deleted",
          eventKey: `action:${id}:action_deleted`,
          metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id, deleteReason: "user_delete" },
        });
      }
      return item;
    });
    return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
  });

  app.patch("/api/actions/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = idParams.parse(request.params);
    const { status } = actionStatusSchema.parse(request.body);
    const action = await db.actionItem.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!action) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "可更新的行动不存在" } });
    }
    const transition = resolveActionTransition({ mode: env.ACTION_ENGINE_MODE, status: action.status, event: { type: status === "completed" ? "COMPLETE" : status === "deferred" ? "DEFER" : "DELETE" }, telemetry });
    if (!transition.accepted) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "可更新的行动不存在" } });
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.actionItem.update({
        where: { id },
        data: {
          status: transition.state,
          ...(status === "completed" ? { completedAt: new Date() } : {}),
          expiresAt: addDays(new Date(), RECORD_DAYS),
        },
      });
      if (status === "completed") {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "action_completed", eventKey: `action:${id}:action_completed`,
          metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id },
        });
      } else if (status === "deferred") {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "action_deferred", eventKey: `action:${id}:action_deferred`,
          metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id },
        });
      } else {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "action_deleted", eventKey: `action:${id}:action_deleted`,
          metadata: { sessionId: auth.sessionId, conversationId: action.conversationId, actionId: id, deleteReason: "user_delete" },
        });
      }
      return item;
    });
    return { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() };
  });
}
