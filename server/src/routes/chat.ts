import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import type { ChatTurnResponse, EmotionState, PublicActionItem } from "@otter/shared";
import { buildVisualCue } from "../modules/support/visual-cue.js";
import { buildAudioCue } from "../modules/support/audio-cue.js";
import type { AppEnv } from "../config/env.js";
import { POLICY_VERSION, PROMPT_VERSION, RECORD_DAYS } from "../config/constants.js";
import { requireAuth } from "../services/session-service.js";
import { logBehavior } from "../services/behavior-service.js";
import { addDays } from "../utils.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";
import { emotionStateSchema } from "../modules/support/schemas.js";
import { parseGuidanceState } from "../modules/support/guidance-state.js";
import { markMemoriesRecalled, persistMemoryCandidates, recallMemories } from "../modules/memory/repository.js";

const turnSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(6000),
}).strict();

function publicAction(action: { id: string; text: string; status: string; createdAt: Date }): PublicActionItem {
  return {
    id: action.id,
    text: action.text,
    status: action.status as PublicActionItem["status"],
    createdAt: action.createdAt.toISOString(),
  };
}

function snapshotState(snapshot: {
  valence: number;
  arousal: number;
  stressLoad: number;
  cognitiveOverload: number;
  supportNeed: number;
  confidence: number;
  evidenceJson: unknown;
  validUntil: Date;
}): EmotionState {
  return {
    valence: snapshot.valence,
    arousal: snapshot.arousal,
    stressLoad: snapshot.stressLoad,
    cognitiveOverload: snapshot.cognitiveOverload,
    supportNeed: snapshot.supportNeed,
    control: 0.5,
    emotionStatus: "unknown",
    emotionLabels: [],
    emotionSubject: "unknown",
    emotionSchemaVersion: 1,
    confidence: snapshot.confidence,
    evidenceSpans: Array.isArray(snapshot.evidenceJson)
      ? snapshot.evidenceJson.filter((item): item is string => typeof item === "string")
      : [],
    validUntil: snapshot.validUntil.toISOString(),
  };
}

export function registerChatRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  env: AppEnv,
  orchestrator: Pick<SupportOrchestrator, "run">,
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
    if (existing) return reply.code(409).send({ error: { code: "TURN_IN_PROGRESS", message: "这一轮正在处理，请稍后重试" } });

    const now = new Date();
    const expiresAt = addDays(now, RECORD_DAYS);
    const turnId = randomUUID();
    try {
      const userMessage = await db.$transaction(async (tx) => {
        // Lock the conversation before inserting the child Turn row. Creating
        // the FK child first lets two requests hold key-share locks while both
        // try to update the parent, which PostgreSQL can resolve as a deadlock.
        const locked = await tx.conversation.updateMany({
          where: { id: conversation.id, processingTurnId: null },
          data: { processingTurnId: turnId },
        });
        if (locked.count !== 1) {
          throw Object.assign(new Error("会话正在处理另一条消息"), { statusCode: 409, code: "CONCURRENT_TURN" });
        }
        await tx.turn.create({
          data: { id: turnId, conversationId: conversation.id, idempotencyKey, status: "processing", expiresAt },
        });
        return tx.message.create({
          data: { conversationId: conversation.id, turnId, role: "user", content: body.text, expiresAt },
        });
      });

      const [recent, previousSnapshots, memories, action, followup] = await Promise.all([
        db.message.findMany({
          where: { conversationId: conversation.id, id: { not: userMessage.id } },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        db.stateSnapshot.findMany({
          where: { conversationId: conversation.id, validUntil: { gt: now } },
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            valence: true,
            arousal: true,
            stressLoad: true,
            cognitiveOverload: true,
            supportNeed: true,
            confidence: true,
            evidenceJson: true,
            validUntil: true,
            rawStateJson: true,
          },
        }),
        recallMemories(db, auth.userId, body.text, now),
        db.actionItem.findFirst({
          where: { conversationId: conversation.id, status: { in: ["confirmed", "deferred"] } },
          orderBy: { updatedAt: "desc" },
        }),
        db.followupTask.findFirst({
          where: { conversationId: conversation.id, status: { in: ["pending", "deferred"] }, expiresAt: { gt: now } },
          include: { action: true },
          orderBy: { dueAt: "asc" },
        }),
      ]);
      const previousRawStates = previousSnapshots.map((snapshot) => {
        const parsed = emotionStateSchema.safeParse(snapshot.rawStateJson);
        return parsed.success ? parsed.data : snapshotState(snapshot);
      });
      const previousSmoothedState = previousSnapshots[0] ? snapshotState(previousSnapshots[0]) : undefined;
      const result = await orchestrator.run({
        text: body.text,
        currentSpirit: conversation.activeSpirit,
        spiritTurnCount: conversation.spiritTurnCount,
        companionLockTurns: conversation.companionLockTurns,
        recentContext: recent.reverse().map((message) => `${message.role}: ${message.content}`),
        previousRawStates,
        ...(previousSmoothedState ? { previousSmoothedState } : {}),
        memories,
        actionContext: {
          ...(action ? { action: action.text } : {}),
          ...(followup ? { followup: `关于“${followup.action.text}”的回访，计划时间 ${followup.dueAt.toISOString()}` } : {}),
        },
        guidanceState: parseGuidanceState(conversation.guidanceStateJson),
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
            rawStateJson: JSON.parse(JSON.stringify(result.rawState)) as Prisma.InputJsonValue,
            validUntil: new Date(result.state.validUntil),
            expiresAt,
          },
        });
        await tx.supportEvent.create({
          data: {
            conversationId: conversation.id,
            turnId,
            activeSpirit: result.plan.activeSpirit,
            transitionStyle: result.plan.transitionStyle,
            routeReasonsJson: result.plan.routeReasonCodes,
            supportMode: result.plan.supportMode,
            riskLevel: result.riskLevel,
            primaryStrategy: result.plan.primaryStrategy,
            planJson: JSON.parse(JSON.stringify(result.plan)) as Prisma.InputJsonValue,
            signalFeaturesJson: JSON.parse(JSON.stringify({
              expressionClarityScore: result.signals.expressionClarityScore,
              progressReadinessScore: result.signals.progressReadinessScore,
              confidence: result.signals.confidence,
              evidenceSpans: result.signals.evidenceSpans,
              ruleCodes: result.signals.ruleCodes ?? [],
              ...(env.EMOTION_INFERENCE_V2 ? { emotionInference: result.emotionHypothesis } : {}),
            })) as Prisma.InputJsonValue,
            ...(result.responseStyleDiagnostics ? {
              responseStyleJson: JSON.parse(JSON.stringify(result.responseStyleDiagnostics)) as Prisma.InputJsonValue,
            } : {}),
            promptVersion: PROMPT_VERSION,
            policyVersion: POLICY_VERSION,
            characterVersion: result.characterVersion,
            expiresAt,
          },
        });

        const createdAction = result.actionDraft
          ? await tx.actionItem.create({
              data: { conversationId: conversation.id, turnId, text: result.actionDraft, expiresAt },
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
        } else {
          await persistMemoryCandidates(tx, {
            userId: auth.userId,
            conversationId: conversation.id,
            messageId: userMessage.id,
            userText: body.text,
            candidates: result.memoryCandidates,
            now,
          });
          await markMemoriesRecalled(tx, memories.map((memory) => memory.id), now);
        }

        const isSafety = result.riskLevel === "high" || result.riskLevel === "imminent";
        const publicResult: ChatTurnResponse = {
          turnId,
          reply: {
            id: assistantMessage.id,
            role: "assistant",
            content: assistantMessage.content,
            createdAt: assistantMessage.createdAt.toISOString(),
          },
          scene: result.plan.sceneState,
          ...(createdAction ? { action: publicAction(createdAction) } : {}),
          safety: isSafety ? "direct_support" : "normal",
          responseSource: result.responseSource,
          visualCue: buildVisualCue({ riskLevel: result.riskLevel, plan: result.plan, hasActionDraft: Boolean(result.actionDraft) }),
          ...(env.AUDIO_V1 ? { audioCue: buildAudioCue({ riskLevel: result.riskLevel, activeSpirit: result.plan.activeSpirit, hasActionDraft: Boolean(result.actionDraft) }) } : {}),
          ...(isSafety ? {} : { emotionFeedback: buildPublicEmotionFeedback(result.state, previousSmoothedState) }),
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
          data: {
            processingTurnId: null,
            activeSpirit: result.plan.activeSpirit,
            spiritTurnCount: result.nextSpiritTurnCount,
            companionLockTurns: result.nextCompanionLockTurns,
            guidanceStateJson: JSON.parse(JSON.stringify(result.nextGuidanceState)) as Prisma.InputJsonValue,
          },
        });
        await logBehavior(tx, auth.userId, "turn_completed", {
          spirit: result.plan.activeSpirit,
          transition: result.plan.transitionStyle,
          risk: result.riskLevel,
        }, latencyMs);
        if (createdAction) await logBehavior(tx, auth.userId, "action_draft_created", { actionId: createdAction.id });
        return publicResult;
      });
      return response;
    } catch (error) {
      await db.$transaction(async (tx) => {
        await tx.turn.updateMany({ where: { id: turnId }, data: { status: "failed", errorCode: "TURN_FAILED" } });
        await tx.conversation.updateMany({
          where: { id: conversation.id, processingTurnId: turnId },
          data: { processingTurnId: null },
        });
        await logBehavior(tx, auth.userId, "turn_failed");
      });
      throw error;
    }
  });
}
