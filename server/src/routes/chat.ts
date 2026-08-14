import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import type { ChatTurnResponse, PublicActionItem } from "@otter/shared";
import type { AppEnv } from "../config/env.js";
import { POLICY_VERSION, PROMPT_VERSION, RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logBehavior } from "../services/behavior-service.js";
import { addDays } from "../utils.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";

const turnSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(6000),
  intent: z.enum(["auto", "talk", "organize"]).default("auto"),
});

function publicAction(action: { id: string; text: string; status: string; createdAt: Date }): PublicActionItem {
  return {
    id: action.id,
    text: action.text,
    status: action.status as PublicActionItem["status"],
    createdAt: action.createdAt.toISOString(),
  };
}

export function registerChatRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  env: AppEnv,
  orchestrator: SupportOrchestrator,
): void {
  app.post("/api/chat/turn", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    const body = turnSchema.parse(request.body);
    const idempotencyKey = z.string().min(8).max(128).parse(request.headers["idempotency-key"]);
    const conversation = await db.conversation.findFirst({ where: { id: body.conversationId, userId: auth.userId } });
    if (!conversation) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });

    const existing = await db.turn.findUnique({
      where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey } },
    });
    if (existing?.status === "completed" && existing.resultJson) return existing.resultJson;
    if (existing) return reply.code(409).send({ error: { code: "TURN_IN_PROGRESS", message: "这一轮正在处理或需要使用新的请求标识重试" } });

    const now = new Date();
    const expiresAt = addDays(now, RECORD_DAYS);
    const turnId = randomUUID();
    try {
      await db.$transaction(async (tx) => {
        await tx.turn.create({
          data: { id: turnId, conversationId: conversation.id, idempotencyKey, intent: body.intent, expiresAt },
        });
        const locked = await tx.conversation.updateMany({
          where: { id: conversation.id, processingTurnId: null },
          data: { processingTurnId: turnId },
        });
        if (locked.count !== 1) throw Object.assign(new Error("会话正处理另一条消息"), { statusCode: 409, code: "CONCURRENT_TURN" });
        await tx.turn.update({ where: { id: turnId }, data: { status: "processing" } });
        await tx.message.create({
          data: { conversationId: conversation.id, turnId, role: "user", content: body.text, expiresAt },
        });
        await tx.modeTransition.updateMany({
          where: { conversationId: conversation.id, status: "pending" },
          data: { status: "expired" },
        });
      });

      const recent = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const previousState = await db.stateSnapshot.findFirst({
        where: { conversationId: conversation.id, validUntil: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { valence: true, arousal: true, stressLoad: true, cognitiveOverload: true },
      });
      const result = await orchestrator.run({
        text: body.text,
        intent: body.intent,
        currentMode: conversation.mode,
        // A UI intent is only a request to invite transition. Acceptance is
        // represented by the conversation mode changed by the transition API.
        transitionAccepted: false,
        recentContext: recent.reverse().map((message) => `${message.role}: ${message.content}`),
      });

      const response = await db.$transaction(async (tx): Promise<ChatTurnResponse> => {
        const currentTurn = await tx.turn.findUniqueOrThrow({ where: { id: turnId } });
        if (currentTurn.status !== "processing") throw new Error("轮次状态已变化");
        const assistantMessage = await tx.message.create({
          data: { conversationId: conversation.id, turnId, role: "assistant", content: result.reply, expiresAt },
        });
        await tx.stateSnapshot.create({
          data: {
            conversationId: conversation.id,
            turnId,
            valence: result.state.valence,
            arousal: result.state.arousal,
            stressLoad: result.state.stressLoad,
            cognitiveOverload: result.state.cognitiveOverload,
            supportNeed: result.state.supportNeed,
            confidence: result.state.confidence,
            evidenceJson: result.state.evidenceSpans,
            validUntil: new Date(result.state.validUntil),
            expiresAt,
          },
        });
        await tx.supportEvent.create({
          data: {
            conversationId: conversation.id,
            turnId,
            surfaceMode: result.plan.surfaceMode,
            supportMode: result.plan.supportMode,
            riskLevel: result.riskLevel,
            primaryStrategy: result.plan.primaryStrategy,
            planJson: JSON.parse(JSON.stringify(result.plan)) as Prisma.InputJsonValue,
            promptVersion: PROMPT_VERSION,
            policyVersion: POLICY_VERSION,
            expiresAt,
          },
        });

        const action = result.actionDraft
          ? await tx.actionItem.create({
              data: { conversationId: conversation.id, turnId, text: result.actionDraft, expiresAt },
            })
          : null;
        const transition = result.plan.allowModeInvitation
          ? await tx.modeTransition.create({
              data: { conversationId: conversation.id, turnId, targetMode: "organize", expiresAt },
            })
          : null;

        if (result.riskLevel === "high" || result.riskLevel === "imminent") {
          await tx.safetyEvent.create({
            data: {
              conversationId: conversation.id,
              turnId,
              riskLevel: result.riskLevel,
              ruleCodesJson: result.ruleCodes,
              disposition: "direct_support",
              expiresAt,
            },
          });
        }

        const publicResult: ChatTurnResponse = {
          turnId,
          reply: {
            id: assistantMessage.id,
            role: "assistant",
            content: assistantMessage.content,
            createdAt: assistantMessage.createdAt.toISOString(),
          },
          mode: result.plan.surfaceMode,
          scene: result.plan.sceneState,
          ...(transition ? { modeTransition: { id: transition.id, prompt: "要不要先浮上来透口气？我们只捞起眼前最重要的一件事。" } } : {}),
          ...(action ? { action: publicAction(action) } : {}),
          safety: result.riskLevel === "high" || result.riskLevel === "imminent" ? "direct_support" : "normal",
          ...(result.riskLevel === "high" || result.riskLevel === "imminent"
            ? {}
            : { emotionFeedback: buildPublicEmotionFeedback(result.state, previousState) }),
        };
        const latencyMs = result.metrics.reduce((sum, metric) => sum + metric.latencyMs, 0);
        const promptTokens = result.metrics.reduce((sum, metric) => sum + (metric.promptTokens ?? 0), 0);
        const outputTokens = result.metrics.reduce((sum, metric) => sum + (metric.outputTokens ?? 0), 0);
        const lastMetric = result.metrics.at(-1);
        await tx.turn.update({
          where: { id: turnId },
          data: {
            status: "completed",
            completedAt: new Date(),
            resultJson: JSON.parse(JSON.stringify(publicResult)) as Prisma.InputJsonValue,
            ...(lastMetric ? { provider: lastMetric.provider, model: lastMetric.model } : {}),
            latencyMs,
            promptTokens,
            outputTokens,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { processingTurnId: null, mode: result.plan.surfaceMode },
        });
        await logBehavior(tx, auth.userId, "turn_completed", { mode: result.plan.surfaceMode, risk: result.riskLevel }, latencyMs);
        if (transition) await logBehavior(tx, auth.userId, "mode_invitation", { transitionId: transition.id });
        if (action) await logBehavior(tx, auth.userId, "action_draft_created", { actionId: action.id });
        return publicResult;
      });
      return response;
    } catch (error) {
      await db.$transaction(async (tx) => {
        await tx.turn.updateMany({ where: { id: turnId }, data: { status: "failed", errorCode: "TURN_FAILED" } });
        await tx.conversation.updateMany({ where: { id: conversation.id, processingTurnId: turnId }, data: { processingTurnId: null } });
        await logBehavior(tx, auth.userId, "turn_failed");
      });
      throw error;
    }
  });
}
