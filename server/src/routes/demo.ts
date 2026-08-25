import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AgentIdV1, ChatTurnResponse, EmotionDiagnostics, EmotionState, PublicFollowup } from "@otter/shared";
import { buildVisualCue } from "../modules/support/visual-cue.js";
import { buildAudioCue } from "../modules/support/audio-cue.js";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { DemoStore } from "../demo/store.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";
import { buildPublicEmotionInterpretation } from "../modules/support/emotion-inference.js";
import { emotionLabelV1Schema } from "../modules/support/schemas.js";
import { registerLocalWebRoutes } from "./local-web.js";
import { parseGuidanceState, resetConversationSegmentState } from "../modules/support/guidance-state.js";
import { feedbackMetadata, healingEndSchema } from "./healing.js";

const turnSchema = z.object({
  conversationId: z.string(),
  text: z.string().trim().min(1).max(6000),
  agentId: z.enum(["zen_deer", "spirit_otter", "bird_courier"]).optional(),
}).strict();
const lanDemoInviteCode = "OTTER-LAN-2026";
const demoRedeemSchema = z.object({
  inviteCode: z.string().trim(),
  adultConfirmed: z.literal(true),
  aiDisclosureAccepted: z.literal(true),
  cloudProcessingAccepted: z.literal(true),
  dataConsentAccepted: z.literal(true),
  deepInterpretationAccepted: z.literal(true),
}).strict();
const correctionSchema = z.object({
  turnId: z.string().uuid(),
  verdict: z.enum(["accurate", "replace", "unknown", "neutral"]),
  labels: z.array(z.object({
    label: emotionLabelV1Schema,
    intensityLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  }).strict()).max(2).default([]),
}).strict().superRefine((value, context) => {
  if (value.verdict === "replace" && (value.labels.length < 1 || value.labels.length > 2)) context.addIssue({ code: "custom", path: ["labels"], message: "replace 需要 1–2 个标签" });
  if (value.verdict !== "replace" && value.labels.length > 0) context.addIssue({ code: "custom", path: ["labels"], message: "只有 replace 可以携带标签" });
});
const dimensions = ["valence", "arousal", "stressLoad", "cognitiveOverload", "supportNeed"] as const;
const memoryStatusSchema = z.enum(["active", "disabled", "rejected", "superseded", "expired", "deleted"]);
const memoryDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["confirm", "disable", "enable", "reject"]) }).strict(),
  z.object({ action: z.literal("correct"), content: z.string().trim().min(3).max(240), structuredValue: z.string().trim().max(160).optional() }).strict(),
]);
const relationDecisionSchema = z.object({ action: z.enum(["confirm", "disable", "enable", "reject"]) }).strict();
const experiencePreferencesSchema = z.object({ deepInterpretationEnabled: z.boolean() }).strict();
const pickState = (state: EmotionState) => Object.fromEntries(dimensions.map((key) => [key, state[key]])) as Pick<EmotionState, typeof dimensions[number]>;

function codesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual.trim().toUpperCase());
  const expectedBuffer = Buffer.from(expected.trim().toUpperCase());
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function registerDemoRoutes(app: FastifyInstance, env: AppEnv, orchestrator: Pick<SupportOrchestrator, "run">, store: DemoStore): void {
  const browserStores = new Map<string, DemoStore>();
  const authorizedSessions = new Set<string>();
  const sessionIdFor = (request: FastifyRequest): string | null => {
    const sessionId = request.headers["x-otter-demo-session"];
    return typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null;
  };
  const storeFor = (request: FastifyRequest): DemoStore => {
    const sessionId = sessionIdFor(request);
    if (!sessionId) return store;
    let browserStore = browserStores.get(sessionId);
    if (!browserStore) {
      browserStore = new (store.constructor as new () => DemoStore)();
      browserStores.set(sessionId, browserStore);
    }
    return browserStore;
  };
  if (env.EXTERNAL_PREVIEW_ENABLED) {
    const publicPaths = new Set(["/api/health", "/api/runtime", "/api/auth/redeem-invite"]);
    app.addHook("preHandler", async (request, reply) => {
      const path = request.url.split("?", 1)[0] ?? request.url;
      if (!path.startsWith("/api/") || publicPaths.has(path)) return;
      const sessionId = sessionIdFor(request);
      if (!sessionId || !authorizedSessions.has(sessionId)) {
        return reply.code(401).send({ error: { code: "PREVIEW_CODE_REQUIRED", message: "请先输入本次体验码" } });
      }
    });
  }
  registerLocalWebRoutes(app);
  app.get("/api/health", async () => ({ status: "ok" }));
  app.post("/api/auth/redeem-invite", {
    config: { rateLimit: { max: env.NODE_ENV === "test" ? 1200 : 8, timeWindow: "10 minutes" } },
  }, async (request, reply) => {
    const body = demoRedeemSchema.parse(request.body);
    const expectedCode = env.EXTERNAL_PREVIEW_ENABLED ? env.EXTERNAL_PREVIEW_CODE : lanDemoInviteCode;
    if (!codesMatch(body.inviteCode, expectedCode)) {
      return reply.code(401).send({ error: { code: "INVALID_INVITE", message: "邀请码无效" } });
    }
    if (env.EXTERNAL_PREVIEW_ENABLED) {
      const sessionId = sessionIdFor(request);
      if (!sessionId) return reply.code(400).send({ error: { code: "INVALID_PREVIEW_SESSION", message: "体验会话无效，请刷新页面后重试" } });
      if (!authorizedSessions.has(sessionId) && authorizedSessions.size >= env.EXTERNAL_PREVIEW_MAX_SESSIONS) {
        return reply.code(503).send({ error: { code: "PREVIEW_CAPACITY_REACHED", message: "本次体验人数已满" } });
      }
      authorizedSessions.add(sessionId);
    }
    const sessionStore = storeFor(request);
    return { researchId: sessionStore.researchId, conversationId: sessionStore.conversationId };
  });
  app.get("/api/session/bootstrap", async (request) => {
    const sessionStore = storeFor(request);
    const latestEmotion = sessionStore.latestDisplayEmotion();
    const currentVisitAt = new Date().toISOString();
    const previousVisitAt = sessionStore.lastVisitAt;
    sessionStore.lastVisitAt = currentVisitAt;
    return {
      researchId: sessionStore.researchId,
      researchContact: env.RESEARCH_CONTACT,
      aiReminder: "你正在与 AI 系统互动；演示数据不会保存。",
      experiencePreferences: { deepInterpretationEnabled: sessionStore.deepInterpretationEnabled },
      visit: {
        visitId: randomUUID(),
        currentVisitAt,
        ...(previousVisitAt ? { previousVisitAt } : {}),
        isReturning: Boolean(previousVisitAt),
      },
      conversation: { id: sessionStore.conversationId, activeAgentId: sessionStore.activeAgentId },
      messages: sessionStore.messages,
      actions: sessionStore.actions.filter((item) => item.status !== "deleted"),
      followups: sessionStore.followups.filter((item) => ["pending", "deferred"].includes(item.status) && new Date(item.dueAt) <= new Date()),
      ...(latestEmotion ? { lastEmotion: { turnId: latestEmotion.turnId, interpretation: buildPublicEmotionInterpretation(latestEmotion.hypothesis) } } : {}),
    };
  });
  app.patch("/api/me/experience-preferences", async (request) => {
    const sessionStore = storeFor(request);
    const preferences = experiencePreferencesSchema.parse(request.body);
    sessionStore.deepInterpretationEnabled = preferences.deepInterpretationEnabled;
    const guidance = parseGuidanceState(sessionStore.guidanceState);
    guidance.healing.deepAnalysisEnabled = preferences.deepInterpretationEnabled;
    sessionStore.guidanceState = guidance;
    return preferences;
  });
  app.post("/api/conversations/:id/end", async (request, reply) => {
    const sessionStore = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = healingEndSchema.parse(request.body);
    if (id !== sessionStore.conversationId) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    const guidance = parseGuidanceState(sessionStore.guidanceState);
    const segmentId = "segmentId" in body ? body.segmentId : guidance.healing.segmentId;
    const metadata = feedbackMetadata(body);
    const record = {
      segmentId,
      feedbackSchemaVersion: ("segmentId" in body ? 2 : 1) as 1 | 2,
      skipped: body.skipped === true,
      verdict: metadata?.verdict ?? null,
      understanding: metadata?.understanding ?? null,
      movement: metadata?.movement ?? null,
      reason: metadata?.reason ?? null,
    };
    if (segmentId !== guidance.healing.segmentId) {
      if (!sessionStore.feedbackForSegment(segmentId)) return reply.code(409).send({ error: { code: "STALE_FEEDBACK_SEGMENT", message: "这段聊天已经结束，请重新打开反馈面板" } });
      try {
        sessionStore.recordConversationFeedback(record);
        return { ended: true as const, duplicate: true as const };
      } catch (reason) {
        return reply.code(409).send({ error: { code: "STALE_FEEDBACK_SEGMENT", message: reason instanceof Error ? reason.message : "这段聊天已经结束" } });
      }
    }
    const saved = sessionStore.recordConversationFeedback(record);
    sessionStore.guidanceState = resetConversationSegmentState(guidance, `segment-${randomUUID()}`, sessionStore.deepInterpretationEnabled);
    return saved.duplicate ? { ended: true as const, duplicate: true as const } : { ended: true as const };
  });
  app.post("/api/conversations/:id/healing-feedback-requested", async (request, reply) => {
    const sessionStore = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    if (id !== sessionStore.conversationId) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    return { requested: true as const, segmentId: parseGuidanceState(sessionStore.guidanceState).healing.segmentId };
  });
  app.post("/api/chat/turn", async (request, reply) => {
    const store = storeFor(request);
    const body = turnSchema.parse(request.body);
    if (body.conversationId !== store.conversationId) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    const activeAgentId: AgentIdV1 = body.agentId ?? store.activeAgentId;
    const recentContext = store.messages.slice(-12).map((message) => `${message.role}${message.agentId ? `[${message.agentId}]` : ""}: ${message.content}`);
    const userMessage = store.addMessage("user", body.text, activeAgentId);
    const previous = store.states.at(-1)?.smoothed;
    const memories = store.recallMemories(body.text, env.MEMORY_V2);
    const actionContext = store.actions.find((item) => ["confirmed", "deferred"].includes(item.status));
    const followupContext = store.followups.find((item) => ["pending", "deferred"].includes(item.status));
    const previousEmotionCorrection = store.getPendingEmotionCorrection();
    const result = await orchestrator.run({
      text: body.text,
      agentId: activeAgentId,
      currentSpirit: store.activeSpirit,
      spiritTurnCount: store.spiritTurnCount,
      companionLockTurns: store.companionLockTurns,
      recentContext,
      previousRawStates: store.states.slice(-2).reverse().map((entry) => entry.raw),
      ...(previous ? { previousSmoothedState: previous } : {}),
      memories,
      actionContext: {
        ...(actionContext ? { action: actionContext.text } : {}),
        ...(followupContext ? { followup: `关于“${followupContext.action.text}”的回访` } : {}),
      },
      guidanceState: store.guidanceState,
      ...(previousEmotionCorrection ? { previousEmotionCorrection } : {}),
    });
    const turnId = randomUUID();
    const assistant = store.addMessage("assistant", result.reply, activeAgentId);
    store.activeAgentId = activeAgentId;
    store.activeSpirit = result.plan.activeSpirit;
    store.spiritTurnCount = result.nextSpiritTurnCount;
    store.companionLockTurns = result.nextCompanionLockTurns;
    store.guidanceState = result.nextGuidanceState;
    store.deepInterpretationEnabled = result.nextGuidanceState.healing.deepAnalysisEnabled;
    store.consumePendingEmotionCorrection();
    store.states.push({ raw: result.rawState, smoothed: result.state });
    if (env.EMOTION_INFERENCE_V2) store.recordEmotion(turnId, result.emotionHypothesis, result.riskLevel === "low");
    const isSafety = result.riskLevel === "high" || result.riskLevel === "imminent";
    if (isSafety) store.markSafetyTurn(turnId);
    else { store.persistMemories(result.memoryCandidates, result.memoryRelationCandidates, body.text, env.MEMORY_V2); store.markRelationsPresented(memories); }
    const action = result.actionDraft ? store.createAction(result.actionDraft) : null;
    const changes = Object.fromEntries(dimensions.map((key) => [key, result.state[key] - (previous?.[key] ?? result.state[key])])) as EmotionDiagnostics["changes"];
    const diagnostics: EmotionDiagnostics = {
      observedAt: new Date().toISOString(),
      raw: pickState(result.rawState),
      smoothed: pickState(result.state),
      changes,
      confidence: result.state.confidence,
      evidenceSpans: result.state.evidenceSpans,
      signalSource: result.signalSource,
      control: result.state.control,
      emotionStatus: result.state.emotionStatus,
      emotionLabels: result.state.emotionLabels,
      emotionSubject: result.state.emotionSubject,
    };
    const response: ChatTurnResponse = {
      turnId,
      reply: assistant,
      activeAgentId,
      scene: result.plan.sceneState,
      ...(action ? { action } : {}),
      safety: isSafety ? "direct_support" : "normal",
      responseSource: result.responseSource,
      visualCue: buildVisualCue({ agentId: activeAgentId, riskLevel: result.riskLevel, plan: result.plan, hasActionDraft: Boolean(result.actionDraft) }),
      ...(env.AUDIO_V1 ? { audioCue: buildAudioCue({ agentId: activeAgentId, riskLevel: result.riskLevel, activeSpirit: result.plan.activeSpirit, hasActionDraft: Boolean(result.actionDraft) }) } : {}),
      ...(isSafety ? {} : {
        ...(result.plan.sceneState === "surface_chat" ? {} : { emotionFeedback: buildPublicEmotionFeedback(result.state, previous) }),
        emotionDiagnostics: diagnostics,
        ...(env.EMOTION_INFERENCE_V2 && result.riskLevel === "low" && result.plan.sceneState !== "surface_chat" ? { emotionInterpretation: buildPublicEmotionInterpretation(result.emotionHypothesis) } : {}),
        characterDiagnostics: {
          activeSpirit: result.plan.activeSpirit,
          transitionStyle: result.plan.transitionStyle,
          reasonCodes: result.plan.routeReasonCodes,
          lockTurnsRemaining: result.nextCompanionLockTurns,
          characterVersion: result.characterVersion,
          ...(result.responseStyleDiagnostics ? { responseStyle: result.responseStyleDiagnostics } : {}),
        },
      }),
    };
    void userMessage;
    return response;
  });
  app.post("/api/emotion-corrections", async (request) => {
    const sessionStore = storeFor(request);
    const body = correctionSchema.parse(request.body);
    const result = sessionStore.correctEmotion(body.turnId, body.verdict, body.labels);
    return {
      correction: result.correction,
      emotionInterpretation: buildPublicEmotionInterpretation(result.displayHypothesis),
    };
  });
  app.post("/api/actions/:id/confirm", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ decision: z.enum(["confirm", "abandon"]), text: z.string().trim().min(1).max(240).optional() }).parse(request.body);
    return store.confirmAction(id, body.decision, body.text);
  });
  app.patch("/api/actions/:id", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z.object({ status: z.enum(["completed", "deferred", "deleted"]) }).parse(request.body);
    return store.updateAction(id, status);
  });
  app.post("/api/followups", async (request, reply) => {
    const store = storeFor(request);
    const body = z.object({ actionId: z.string(), dueAt: z.string().datetime(), authorized: z.literal(true) }).parse(request.body);
    return reply.code(201).send(store.createFollowup(body.actionId, body.dueAt));
  });
  app.patch("/api/followups/:id", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z.object({ status: z.enum(["completed", "deferred", "closed", "deleted"]) }).parse(request.body);
    return store.updateFollowup(id, status as PublicFollowup["status"]);
  });
  app.post("/api/followups/:id/outcome", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { state } = z.object({
      state: z.enum(["not_started", "partial_progress", "completed", "blocked", "redefined"]),
      source: z.literal("ui_select"),
    }).parse(request.body);
    return store.labelFollowupOutcome(id, state);
  });
  app.post("/api/safety-events/:turnId/request-help", async (request, reply) => {
    const store = storeFor(request);
    const { turnId } = z.object({ turnId: z.string() }).parse(request.params);
    if (!store.hasSafetyTurn(turnId)) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "安全事件不存在" } });
    return { requested: true, contact: env.RESEARCH_CONTACT };
  });
  app.get("/api/me/export", async (request) => {
    const store = storeFor(request);
    return {
      exportedAt: new Date().toISOString(),
      researchId: store.researchId,
      messages: store.messages,
      actions: store.actions,
      followups: store.followups,
      memories: store.exportMemories(),
      emotionRecords: store.exportEmotionRecords(),
      conversationFeedbackRecords: store.exportConversationFeedbackRecords(),
    };
  });
  app.get("/api/me/memories", async (request) => {
    const store = storeFor(request);
    const query = z.object({ status: memoryStatusSchema.optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }).parse(request.query);
    const all = store.listMemories(query.status);
    const start = query.cursor ? Math.max(0, all.findIndex((memory) => memory.id === query.cursor) + 1) : 0;
    const items = all.slice(start, start + query.limit);
    return { items, ...(start + query.limit < all.length ? { nextCursor: items.at(-1)?.id } : {}) };
  });
  app.patch("/api/me/memories/:id", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return store.decideMemory(id, memoryDecisionSchema.parse(request.body));
  });
  app.delete("/api/me/memories/:id", async (request, reply) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    store.deleteMemory(id);
    return reply.code(204).send();
  });
  app.patch("/api/me/memory-relations/:id", async (request) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return store.decideRelation(id, relationDecisionSchema.parse(request.body));
  });
  app.delete("/api/me/memory-relations/:id", async (request, reply) => {
    const store = storeFor(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    store.deleteRelation(id);
    return reply.code(204).send();
  });
  app.post("/api/auth/logout", async (request, reply) => {
    const store = storeFor(request);
    store.reset();
    const sessionId = sessionIdFor(request);
    if (sessionId) authorizedSessions.delete(sessionId);
    return reply.code(204).send();
  });
  app.delete("/api/me/data", async (request, reply) => {
    const store = storeFor(request);
    store.reset();
    const sessionId = sessionIdFor(request);
    if (sessionId) authorizedSessions.delete(sessionId);
    return reply.code(204).send();
  });
  if (process.env.E2E_MODE === "demo") {
    app.post("/api/demo/shutdown", async (_request, reply) => {
      void reply.code(204).send();
      setTimeout(() => process.exit(0), 50);
    });
  }
}
