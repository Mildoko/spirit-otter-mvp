import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logCoreDialogueEvent } from "../services/behavior-service.js";
import { addDays } from "../utils.js";
import { followupDelayBucket } from "../events/core-dialogue-events.js";
import { assertFollowupOutcomeTransition, followupOutcomeSchema, lifecycleStatusForOutcome } from "../followups/outcome-state.js";
import type { AiTelemetry } from "../observability/ai-telemetry.js";
import { assertFollowupCreation } from "../state-machines/followup-machine.js";
import { resolveFollowupTransition } from "../state-machines/followup-transition.js";

const createSchema = z.object({
  actionId: z.string(),
  dueAt: z.coerce.date(),
  authorized: z.literal(true),
});
const patchSchema = z.object({ status: z.enum(["completed", "deferred", "closed", "deleted"]) });
const outcomeSchema = z.object({ state: followupOutcomeSchema, source: z.literal("ui_select") }).strict();

export function registerFollowupRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv, telemetry?: AiTelemetry): void {
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
    assertFollowupCreation({ authorized: body.authorized, actionStatus: action.status });
    const followup = await db.$transaction(async (tx) => {
      const item = await tx.followupTask.create({
        data: {
          conversationId: action.conversationId,
          actionId: action.id,
          dueAt: body.dueAt,
          expiresAt: addDays(now, RECORD_DAYS),
        },
      });
      await logCoreDialogueEvent(tx, auth.userId, {
        eventName: "followup_created",
        eventKey: `followup:${item.id}:followup_created`,
        metadata: {
          sessionId: auth.sessionId,
          conversationId: action.conversationId,
          followupId: item.id,
          linkedActionId: action.id,
          delayBucket: followupDelayBucket(body.dueAt.getTime() - now.getTime()),
        },
        occurredAt: now,
      });
      return item;
    });
    return reply.code(201).send({ ...followup, dueAt: followup.dueAt.toISOString() });
  });

  app.patch("/api/followups/:id", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = patchSchema.parse(request.body);
    const followup = await db.followupTask.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!followup) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "回访不存在" } });
    }
    const transition = resolveFollowupTransition({
      mode: env.FOLLOWUP_ENGINE_MODE, status: followup.status, outcomeState: followup.outcomeState,
      outcomeLabeled: followup.outcomeLabeledAt !== null,
      event: { type: status === "completed" ? "COMPLETE" : status === "deferred" ? "DEFER" : status === "closed" ? "CLOSE" : "DELETE" }, telemetry,
    });
    if (!transition.accepted) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "回访不存在" } });
    const updated = await db.$transaction(async (tx) => {
      const item = await tx.followupTask.update({
        where: { id },
        data: { status: transition.state.status, expiresAt: addDays(new Date(), RECORD_DAYS) },
      });
      if (status === "completed") {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "followup_closed", eventKey: `followup:${id}:followup_closed`,
          metadata: { sessionId: auth.sessionId, conversationId: followup.conversationId, followupId: id, closeReason: "completed" },
        });
      } else if (status === "deferred") {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "followup_deferred", eventKey: `followup:${id}:followup_deferred`,
          metadata: { sessionId: auth.sessionId, conversationId: followup.conversationId, followupId: id },
        });
      } else if (status === "closed") {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "followup_closed", eventKey: `followup:${id}:followup_closed`,
          metadata: { sessionId: auth.sessionId, conversationId: followup.conversationId, followupId: id, closeReason: "paused" },
        });
      } else {
        await logCoreDialogueEvent(tx, auth.userId, {
          eventName: "followup_deleted", eventKey: `followup:${id}:followup_deleted`,
          metadata: { sessionId: auth.sessionId, conversationId: followup.conversationId, followupId: id },
        });
      }
      return item;
    });
    return { ...updated, dueAt: updated.dueAt.toISOString() };
  });

  app.post("/api/followups/:id/outcome", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = outcomeSchema.parse(request.body);
    const followup = await db.followupTask.findFirst({ where: { id, conversation: { userId: auth.userId } } });
    if (!followup || followup.status === "deleted") {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "回访不存在" } });
    }
    const transition = resolveFollowupTransition({
      mode: env.FOLLOWUP_ENGINE_MODE, status: followup.status, outcomeState: followup.outcomeState,
      outcomeLabeled: followup.outcomeLabeledAt !== null, event: { type: "LABEL_OUTCOME", state: body.state }, telemetry,
    });
    try {
      if (!transition.accepted) assertFollowupOutcomeTransition({
        from: followup.outcomeState,
        to: body.state,
        wasPreviouslyLabeled: followup.outcomeLabeledAt !== null,
      });
    } catch (error) {
      const failure = error as Error & { statusCode?: number; code?: string };
      return reply.code(failure.statusCode ?? 409).send({ error: { code: failure.code ?? "INVALID_FOLLOWUP_OUTCOME_TRANSITION", message: failure.message } });
    }
    const now = new Date();
    const revision = followup.outcomeRevision + 1;
    const updated = await db.$transaction(async (tx) => {
      const claimed = await tx.followupTask.updateMany({
        where: { id, outcomeRevision: followup.outcomeRevision },
        data: {
          outcomeState: body.state,
          outcomeLabeledAt: now,
          outcomeRevision: revision,
          status: transition.state.status ?? lifecycleStatusForOutcome(body.state),
          expiresAt: addDays(now, RECORD_DAYS),
        },
      });
      if (claimed.count !== 1) throw Object.assign(new Error("回访结果已被其他请求更新"), { statusCode: 409, code: "FOLLOWUP_OUTCOME_CONFLICT" });
      if (body.state === "completed") {
        await tx.actionItem.updateMany({ where: { id: followup.actionId, status: { not: "deleted" } }, data: { status: "completed", completedAt: now } });
      } else {
        await tx.actionItem.updateMany({ where: { id: followup.actionId, status: "confirmed" }, data: { status: "deferred" } });
      }
      await logCoreDialogueEvent(tx, auth.userId, {
        eventName: "followup_state_labeled",
        eventKey: `followup:${id}:followup_state_labeled:${revision}`,
        metadata: {
          sessionId: auth.sessionId,
          conversationId: followup.conversationId,
          followupId: id,
          previousState: followup.outcomeState,
          state: body.state,
          revision,
          labelSource: body.source,
          transitionValid: true,
        },
        occurredAt: now,
      });
      return tx.followupTask.findUniqueOrThrow({ where: { id } });
    });
    return { ...updated, dueAt: updated.dueAt.toISOString(), outcomeLabeledAt: updated.outcomeLabeledAt?.toISOString() ?? null };
  });
}
