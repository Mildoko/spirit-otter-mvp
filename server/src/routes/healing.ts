import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { parseGuidanceState, resetConversationSegmentState } from "../modules/support/guidance-state.js";
import { logCoreDialogueEvents } from "../services/behavior-service.js";
import { requireAuth } from "../services/session-service.js";

const legacyFeedbackSchema = z.object({
  schemaVersion: z.literal(1),
  understanding: z.enum(["hit", "partly", "missed"]),
  movement: z.enum(["more_space", "clearer", "more_choice", "unchanged", "worse"]),
  reason: z.enum(["too_shallow", "too_analytical", "too_generic", "unwanted_advice", "misread", "other"]).optional(),
}).strict();

const conversationFeedbackV2Schema = z.object({
  schemaVersion: z.literal(2),
  verdict: z.enum(["helpful", "not_helpful"]),
  understanding: z.enum(["hit", "partly", "missed"]).optional(),
  movement: z.enum(["more_space", "clearer", "more_choice", "unchanged", "worse"]).optional(),
  reason: z.enum(["too_shallow", "repetitive", "too_analytical", "too_generic", "unwanted_advice", "misread", "topic_irrelevant", "topic_not_switched", "other"]).optional(),
}).strict();

export const healingEndSchema = z.union([
  z.object({ segmentId: z.string().min(1).max(80), skipped: z.literal(true) }).strict(),
  z.object({ skipped: z.literal(true) }).strict(),
  z.object({
    segmentId: z.string().min(1).max(80),
    skipped: z.literal(false).optional(),
    feedback: conversationFeedbackV2Schema,
  }).strict(),
  z.object({
    skipped: z.literal(false).optional(),
    feedback: legacyFeedbackSchema,
  }).strict(),
]);

export type HealingEndBody = z.infer<typeof healingEndSchema>;

export function feedbackMetadata(body: HealingEndBody) {
  if (body.skipped) return null;
  if (body.feedback.schemaVersion === 1) return {
    feedbackSchemaVersion: 1 as const,
    verdict: null,
    understanding: body.feedback.understanding,
    movement: body.feedback.movement,
    reason: body.feedback.reason ?? null,
  };
  return {
    feedbackSchemaVersion: 2 as const,
    verdict: body.feedback.verdict,
    understanding: body.feedback.understanding ?? null,
    movement: body.feedback.movement ?? null,
    reason: body.feedback.reason ?? null,
  };
}

function storedFeedbackMatches(metadata: unknown, body: HealingEndBody): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const value = metadata as Record<string, unknown>;
  if (body.skipped) return value.feedbackSchemaVersion === ("segmentId" in body ? 2 : 1);
  const expected = feedbackMetadata(body)!;
  return Object.entries(expected).every(([key, item]) => value[key] === item);
}

export function registerHealingRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/conversations/:id/healing-feedback-requested", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const conversation = await db.conversation.findFirst({ where: { id, userId: auth.userId } });
    if (!conversation) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    const segmentId = parseGuidanceState(conversation.guidanceStateJson).healing.segmentId;
    await logCoreDialogueEvents(db, auth.userId, [{
      eventName: "conversation_feedback_requested",
      eventKey: `conversation-feedback:${segmentId}:requested`,
      metadata: { sessionId: auth.sessionId, conversationId: id, segmentId, source: "end_chat" },
    }]);
    return { requested: true as const, segmentId };
  });

  app.post("/api/conversations/:id/end", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = healingEndSchema.parse(request.body);
    const conversation = await db.conversation.findFirst({ where: { id, userId: auth.userId } });
    if (!conversation) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    const guidance = parseGuidanceState(conversation.guidanceStateJson);
    const segmentId = "segmentId" in body ? body.segmentId : guidance.healing.segmentId;
    if (segmentId !== guidance.healing.segmentId) {
      const eventKey = `conversation-feedback:${segmentId}:${body.skipped ? "skipped" : "submitted"}`;
      const existing = await db.behaviorEvent.findFirst({ where: { userId: auth.userId, eventKey } });
      if (existing && storedFeedbackMatches(existing.metadataJson, body)) return { ended: true as const, duplicate: true as const };
      return reply.code(409).send({ error: { code: "STALE_FEEDBACK_SEGMENT", message: "这段聊天已经结束，请重新打开反馈面板" } });
    }
    const nextGuidance = resetConversationSegmentState(guidance, `segment-${randomUUID()}`, guidance.healing.deepAnalysisEnabled);
    const refs = { sessionId: auth.sessionId, conversationId: conversation.id, segmentId };
    const metadata = feedbackMetadata(body);
    await db.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: conversation.id }, data: { guidanceStateJson: JSON.parse(JSON.stringify(nextGuidance)) as Prisma.InputJsonValue } });
      await logCoreDialogueEvents(tx, auth.userId, [
        body.skipped
          ? { eventName: "conversation_feedback_skipped", eventKey: `conversation-feedback:${segmentId}:skipped`, metadata: { ...refs, feedbackSchemaVersion: "segmentId" in body ? 2 as const : 1 as const, source: "end_chat" as const } }
          : { eventName: "conversation_feedback_submitted", eventKey: `conversation-feedback:${segmentId}:submitted`, metadata: { ...refs, ...metadata!, source: "end_chat" as const } },
        { eventName: "healing_segment_ended", eventKey: `healing:${segmentId}:segment_ended`, metadata: { ...refs, endSource: "user_end" } },
      ]);
    });
    return { ended: true as const };
  });
}
