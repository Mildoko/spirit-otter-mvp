import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ChatTurnResponse, EmotionDiagnostics, EmotionState, PublicFollowup } from "@otter/shared";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { DemoStore } from "../demo/store.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";
import { buildPublicEmotionInterpretation } from "../modules/support/emotion-inference.js";
import { emotionLabelV1Schema } from "../modules/support/schemas.js";
import { registerLocalWebRoutes } from "./local-web.js";

const turnSchema = z.object({
  conversationId: z.string(),
  text: z.string().trim().min(1).max(6000),
}).strict();
const lanDemoInviteCode = "OTTER-LAN-2026";
const demoRedeemSchema = z.object({
  inviteCode: z.string().trim(),
  adultConfirmed: z.literal(true),
  aiDisclosureAccepted: z.literal(true),
  cloudProcessingAccepted: z.literal(true),
  dataConsentAccepted: z.literal(true),
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
const pickState = (state: EmotionState) => Object.fromEntries(dimensions.map((key) => [key, state[key]])) as Pick<EmotionState, typeof dimensions[number]>;

export function registerDemoRoutes(app: FastifyInstance, env: AppEnv, orchestrator: Pick<SupportOrchestrator, "run">, store: DemoStore): void {
  const browserStores = new Map<string, DemoStore>();
  const storeFor = (request: FastifyRequest): DemoStore => {
    const sessionId = request.headers["x-otter-demo-session"];
    if (typeof sessionId !== "string" || !/^[0-9a-f-]{36}$/i.test(sessionId)) return store;
    let browserStore = browserStores.get(sessionId);
    if (!browserStore) {
      browserStore = new (store.constructor as new () => DemoStore)();
      browserStores.set(sessionId, browserStore);
    }
    return browserStore;
  };
  registerLocalWebRoutes(app);
  app.get("/api/health", async () => ({ status: "ok" }));
  app.post("/api/auth/redeem-invite", async (request, reply) => {
    const body = demoRedeemSchema.parse(request.body);
    if (body.inviteCode.toUpperCase() !== lanDemoInviteCode) {
      return reply.code(401).send({ error: { code: "INVALID_INVITE", message: "邀请码无效" } });
    }
    const sessionStore = storeFor(request);
    return { researchId: sessionStore.researchId, conversationId: sessionStore.conversationId };
  });
  app.get("/api/session/bootstrap", async (request) => {
    const sessionStore = storeFor(request);
    const latestEmotion = sessionStore.latestDisplayEmotion();
    return {
      researchId: sessionStore.researchId,
      researchContact: env.RESEARCH_CONTACT,
      aiReminder: "你正在与 AI 系统互动；演示数据不会保存。",
      conversation: { id: sessionStore.conversationId },
      messages: sessionStore.messages,
      actions: sessionStore.actions.filter((item) => item.status !== "deleted"),
      followups: sessionStore.followups.filter((item) => ["pending", "deferred"].includes(item.status) && new Date(item.dueAt) <= new Date()),
      ...(latestEmotion ? { lastEmotion: { turnId: latestEmotion.turnId, interpretation: buildPublicEmotionInterpretation(latestEmotion.hypothesis) } } : {}),
    };
  });
  app.post("/api/chat/turn", async (request, reply) => {
    const store = storeFor(request);
    const body = turnSchema.parse(request.body);
    if (body.conversationId !== store.conversationId) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "会话不存在" } });
    const recentContext = store.messages.slice(-12).map((message) => `${message.role}: ${message.content}`);
    const userMessage = store.addMessage("user", body.text);
    const previous = store.states.at(-1)?.smoothed;
    const memories = store.recallMemories(body.text);
    const actionContext = store.actions.find((item) => ["confirmed", "deferred"].includes(item.status));
    const followupContext = store.followups.find((item) => ["pending", "deferred"].includes(item.status));
    const previousEmotionCorrection = store.getPendingEmotionCorrection();
    const result = await orchestrator.run({
      text: body.text,
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
    const assistant = store.addMessage("assistant", result.reply);
    store.activeSpirit = result.plan.activeSpirit;
    store.spiritTurnCount = result.nextSpiritTurnCount;
    store.companionLockTurns = result.nextCompanionLockTurns;
    store.guidanceState = result.nextGuidanceState;
    store.consumePendingEmotionCorrection();
    store.states.push({ raw: result.rawState, smoothed: result.state });
    if (env.EMOTION_INFERENCE_V2) store.recordEmotion(turnId, result.emotionHypothesis, result.riskLevel === "low");
    const isSafety = result.riskLevel === "high" || result.riskLevel === "imminent";
    if (isSafety) store.markSafetyTurn(turnId);
    else store.persistMemories(result.memoryCandidates);
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
      scene: result.plan.sceneState,
      ...(action ? { action } : {}),
      safety: isSafety ? "direct_support" : "normal",
      responseSource: result.responseSource,
      ...(isSafety ? {} : {
        emotionFeedback: buildPublicEmotionFeedback(result.state, previous),
        emotionDiagnostics: diagnostics,
        ...(env.EMOTION_INFERENCE_V2 && result.riskLevel === "low" ? { emotionInterpretation: buildPublicEmotionInterpretation(result.emotionHypothesis) } : {}),
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
    };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    const store = storeFor(request);
    store.reset();
    return reply.code(204).send();
  });
  app.delete("/api/me/data", async (request, reply) => {
    const store = storeFor(request);
    store.reset();
    return reply.code(204).send();
  });
  if (process.env.E2E_MODE === "demo") {
    app.post("/api/demo/shutdown", async (_request, reply) => {
      void reply.code(204).send();
      setTimeout(() => process.exit(0), 50);
    });
  }
}
