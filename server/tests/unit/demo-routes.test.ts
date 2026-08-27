import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { DemoStore } from "../../src/demo/store.js";

describe("demo mode API contract", () => {
  let app: FastifyInstance;
  let store: DemoStore;
  beforeEach(async () => {
    const env = loadEnv({
      NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "demo-test-secret-with-more-than-thirty-two-characters", COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:3001", LLM_API_KEY: "", BUILD_VERSION: "test-version",
    });
    store = new DemoStore();
    app = await buildApp(env, undefined, { demoStore: store });
    await app.ready();
  });
  afterEach(async () => app.close());

  it("opens and persists a local led topic without publishing an emotion guess", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const conversationId = bootstrap.json().conversation.id as string;
    const opened = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId, text: "我好无聊，你来开个话题" } });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toMatchObject({ scene: "surface_chat", responseSource: "local_fallback" });
    expect(opened.json()).not.toHaveProperty("action");
    expect(opened.json()).not.toHaveProperty("emotionInterpretation");
    expect(opened.json()).not.toHaveProperty("emotionFeedback");
    expect(store.guidanceState.schemaVersion).toBe(4);
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.topicLead.status).toBe("active");
    const firstReply = opened.json().reply.content as string;
    const switched = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId, text: "换一个" } });
    expect(switched.json().scene).toBe("surface_chat");
    expect(switched.json().reply.content).not.toBe(firstReply);
    expect(switched.json().reply.content).not.toContain("无聊");
    await app.inject({ method: "DELETE", url: "/api/me/data" });
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.topicLead.status).toBe("inactive");
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.topicLead.recentTopicIds).toEqual([]);
  });

  it("bootstraps without auth and completes automatic route/action flow", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().conversation).not.toHaveProperty("mode");
    expect(bootstrap.json().visit).toMatchObject({ visitId: expect.any(String), isReturning: false });
    const returnVisit = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    expect(returnVisit.json().visit).toMatchObject({ isReturning: true, previousVisitAt: bootstrap.json().visit.currentVisitAt });
    const conversationId = bootstrap.json().conversation.id as string;
    const blended = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId, text: "请帮我整理事情。" } });
    expect(blended.statusCode).toBe(200);
    expect(blended.json().responseSource).toBe("local_fallback");
    expect(blended.json().audioCue).toMatchObject({
      schemaVersion: 1, agentId: "zen_deer", voiceProfileId: "zen_deer.shore_pick", soundscapePolicy: "normal",
    });
    expect(blended.json().emotionDiagnostics).toBeTruthy();
    expect(blended.json().emotionInterpretation).toMatchObject({ status: expect.any(String), canCorrect: true });
    expect(blended.json().characterDiagnostics.activeSpirit).toBe("shore_pick");
    expect(blended.json().characterDiagnostics.responseStyle).toMatchObject({
      validationStatus: "fallback",
      styleVersion: expect.any(String),
      profile: { questionBudget: expect.any(Number) },
    });
    expect(blended.json()).not.toHaveProperty("modeTransition");
    const actionTurn = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId, text: "先写汇报标题。" } });
    const actionId = actionTurn.json().action.id as string;
    const confirmed = await app.inject({ method: "POST", url: `/api/actions/${actionId}/confirm`, payload: { decision: "confirm", text: "写汇报标题" } });
    expect(confirmed.json().status).toBe("confirmed");
    const followup = await app.inject({
      method: "POST", url: "/api/followups",
      payload: { actionId, dueAt: new Date(Date.now() + 60_000).toISOString(), authorized: true },
    });
    expect(followup.json()).toMatchObject({ outcomeState: "not_started", outcomeLabeledAt: null });
    const outcome = await app.inject({
      method: "POST", url: `/api/followups/${followup.json().id}/outcome`,
      payload: { state: "blocked", source: "ui_select" },
    });
    expect(outcome.json()).toMatchObject({ outcomeState: "blocked", status: "closed" });
  });

  it("keeps Demo action and follow-up APIs compatible under new XState authority", async () => {
    const env = loadEnv({
      NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "demo-xstate-secret-with-more-than-thirty-two-characters", COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:3001", LLM_API_KEY: "", BUILD_VERSION: "test-version",
      GUIDANCE_ENGINE_MODE: "new", ACTION_ENGINE_MODE: "new", FOLLOWUP_ENGINE_MODE: "new",
    });
    const candidateStore = new DemoStore();
    const candidateApp = await buildApp(env, undefined, { demoStore: candidateStore });
    await candidateApp.ready();
    try {
      const abandoned = candidateStore.createAction("放弃的测试行动");
      expect((await candidateApp.inject({ method: "POST", url: `/api/actions/${abandoned.id}/confirm`, payload: { decision: "abandon" } })).json().status).toBe("deleted");

      const action = candidateStore.createAction("原始行动");
      const confirmed = await candidateApp.inject({ method: "POST", url: `/api/actions/${action.id}/confirm`, payload: { decision: "confirm", text: "编辑后的行动" } });
      expect(confirmed.json()).toMatchObject({ status: "confirmed", text: "编辑后的行动" });
      const followup = await candidateApp.inject({
        method: "POST", url: "/api/followups",
        payload: { actionId: action.id, dueAt: new Date(Date.now() + 60_000).toISOString(), authorized: true },
      });
      expect(followup.statusCode).toBe(201);
      const completed = await candidateApp.inject({
        method: "POST", url: `/api/followups/${followup.json().id}/outcome`, payload: { state: "completed", source: "ui_select" },
      });
      expect(completed.json()).toMatchObject({ status: "completed", outcomeState: "completed" });
      expect((await candidateApp.inject({
        method: "POST", url: `/api/followups/${followup.json().id}/outcome`, payload: { state: "blocked", source: "ui_select" },
      })).statusCode).toBe(409);
    } finally {
      await candidateApp.close();
    }
  });

  it("rejects the removed intent field", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat/turn",
      payload: { conversationId: bootstrap.json().conversation.id, text: "你好", intent: "organize" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("omits all diagnostics for high risk and resets all in-memory data", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const response = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId: bootstrap.json().conversation.id, text: "我马上要从楼顶跳下去。" } });
    expect(response.json().safety).toBe("direct_support");
    expect(response.json().responseSource).toBe("static_safety");
    expect(response.json()).not.toHaveProperty("emotionFeedback");
    expect(response.json()).not.toHaveProperty("emotionDiagnostics");
    expect(response.json()).not.toHaveProperty("emotionInterpretation");
    expect(response.json()).not.toHaveProperty("characterDiagnostics");
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap" })).json()).not.toHaveProperty("lastEmotion");
    expect((await app.inject({ method: "DELETE", url: "/api/me/data" })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap" })).json().messages).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/me/export" })).json().memories).toEqual([]);
  });

  it("exposes safe runtime metadata", async () => {
    const runtime = (await app.inject({ method: "GET", url: "/api/runtime" })).json();
    expect(runtime).toMatchObject({
      mode: "demo", persistent: false, externalPreview: false, modelSource: "local_fallback", buildVersion: "test-version", emotionDiagnosticsAvailable: false, sceneWorldV1Enabled: true, audioV1Enabled: true, cloudTtsEnabled: false, memoryV2Enabled: true,
    });
    expect(runtime.capabilityManifest).toMatchObject({ schemaVersion: 1, manifestVersion: "capability-manifest-v1", runtimeMode: "demo" });
    expect(runtime.capabilityManifest.capabilities).toContainEqual(expect.objectContaining({ id: "external_action", status: "unavailable" }));
  });

  it("lists and controls trusted memories and relations", async () => {
    store.persistMemories([
      { kind: "episode", content: "明天要和主管开会", structuredKey: "event.meeting", origin: "user_explicit", sensitivity: "normal", importance: 0.9, confidence: 0.95, evidence: "明天要和主管开会", eventTimeText: "明天" },
      { kind: "user_fact", content: "主管表达很直接", structuredKey: "person.manager", origin: "user_explicit", sensitivity: "normal", importance: 0.9, confidence: 0.95, evidence: "主管表达很直接" },
    ], [{ sourceKey: "event.meeting", targetKey: "person.manager", type: "may_trigger", origin: "model_inference", confidence: 0.95, evidence: "和主管开会" }], "主管表达很直接，明天要和主管开会", true);
    const listed = await app.inject({ method: "GET", url: "/api/me/memories" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(2);
    const memory = listed.json().items[0];
    const confirmed = await app.inject({ method: "PATCH", url: `/api/me/memories/${memory.id}`, payload: { action: "confirm" } });
    expect(confirmed.json().claimState).toBe("confirmed");
    const relation = listed.json().items.flatMap((item: { relations: Array<{ id: string }> }) => item.relations)[0];
    const rejected = await app.inject({ method: "PATCH", url: `/api/me/memory-relations/${relation.id}`, payload: { action: "reject" } });
    expect(rejected.json().status).toBe("rejected");
    expect((await app.inject({ method: "DELETE", url: `/api/me/memories/${memory.id}` })).statusCode).toBe(204);
  });

  it("keeps emotion corrections in the browser session, applies them once, and exports them only on request", async () => {
    const session = "33333333-3333-4333-8333-333333333333";
    const headers = { "x-otter-demo-session": session };
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers });
    const conversationId = bootstrap.json().conversation.id as string;
    const first = await app.inject({ method: "POST", url: "/api/chat/turn", headers, payload: { conversationId, text: "我很生气。" } });
    expect(first.json().emotionInterpretation.labels[0].label).toBe("anger");
    const correction = await app.inject({ method: "POST", url: "/api/emotion-corrections", headers, payload: {
      turnId: first.json().turnId, verdict: "replace", labels: [{ label: "disappointment", intensityLevel: 4 }],
    } });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().emotionInterpretation).toMatchObject({ status: "user_corrected", labels: [{ label: "disappointment", intensityLevel: 4 }] });
    const refreshed = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers });
    expect(refreshed.json().lastEmotion).toMatchObject({ turnId: first.json().turnId, interpretation: { status: "user_corrected", labels: [{ label: "disappointment" }] } });
    const next = await app.inject({ method: "POST", url: "/api/chat/turn", headers, payload: { conversationId, text: "我还想说一点。" } });
    expect(next.json().emotionInterpretation.status).toBe("user_corrected");
    const after = await app.inject({ method: "POST", url: "/api/chat/turn", headers, payload: { conversationId, text: "就是这样。" } });
    expect(after.json().emotionInterpretation.status).toBe("unknown");
    const exported = await app.inject({ method: "GET", url: "/api/me/export", headers });
    expect(exported.json().emotionRecords[0].correction.verdict).toBe("replace");
    await app.inject({ method: "DELETE", url: "/api/me/data", headers });
    expect((await app.inject({ method: "GET", url: "/api/me/export", headers })).json().emotionRecords).toEqual([]);
  });

  it("keeps low-signal guidance state isolated per browser and clears it on reset", async () => {
    const firstSession = "11111111-1111-4111-8111-111111111111";
    const secondSession = "22222222-2222-4222-8222-222222222222";
    const headers = (session: string) => ({ "x-otter-demo-session": session });
    const firstBootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: headers(firstSession) });
    const firstConversation = firstBootstrap.json().conversation.id as string;
    for (const text of ["不知道说什么", "脑子空了", "还是说不上来"]) {
      await app.inject({ method: "POST", url: "/api/chat/turn", headers: headers(firstSession), payload: { conversationId: firstConversation, text } });
    }
    const firstMessages = (await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: headers(firstSession) })).json().messages;
    expect(firstMessages.at(-1).content).not.toMatch(/[？?]/u);

    const secondBootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: headers(secondSession) });
    expect(secondBootstrap.json().messages).toEqual([]);
    await app.inject({ method: "DELETE", url: "/api/me/data", headers: headers(firstSession) });
    const reset = await app.inject({ method: "POST", url: "/api/chat/turn", headers: headers(firstSession), payload: { conversationId: firstConversation, text: "不知道说什么" } });
    expect(reset.json().reply.content).not.toContain("先不继续追问");
  });
});

describe("external preview access control", () => {
  let app: FastifyInstance;
  const previewCode = "OTTER-PREVIEW-ABC123";
  const firstSession = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const secondSession = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const consent = {
    adultConfirmed: true,
    aiDisclosureAccepted: true,
    cloudProcessingAccepted: true,
    dataConsentAccepted: true,
    deepInterpretationAccepted: true,
  };

  beforeEach(async () => {
    const env = loadEnv({
      NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "preview-test-secret-with-more-than-thirty-two-characters", COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://127.0.0.1:3001", LLM_API_KEY: "configured", BUILD_VERSION: "preview-test",
      EXTERNAL_PREVIEW_ENABLED: "true", EXTERNAL_PREVIEW_CODE: previewCode, EXTERNAL_PREVIEW_MAX_SESSIONS: "1",
    });
    app = await buildApp(env, undefined, { demoStore: new DemoStore() });
    await app.ready();
  });

  afterEach(async () => app.close());

  it("requires the preview code before any session data is available", async () => {
    expect((await app.inject({ method: "GET", url: "/api/runtime" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { "x-otter-demo-session": firstSession } })).statusCode).toBe(401);
    expect((await app.inject({
      method: "POST", url: "/api/auth/redeem-invite", headers: { "x-otter-demo-session": firstSession },
      payload: { inviteCode: "WRONG-PREVIEW-CODE", ...consent },
    })).statusCode).toBe(401);

    const redeemed = await app.inject({
      method: "POST", url: "/api/auth/redeem-invite", headers: { "x-otter-demo-session": firstSession },
      payload: { inviteCode: previewCode.toLowerCase(), ...consent },
    });
    expect(redeemed.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { "x-otter-demo-session": firstSession } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { "x-otter-demo-session": secondSession } })).statusCode).toBe(401);
  });

  it("accepts same-origin HTTPS writes forwarded by the loopback tunnel", async () => {
    const publicOrigin = "https://preview.example.test";
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/redeem-invite",
      remoteAddress: "127.0.0.1",
      headers: {
        host: "preview.example.test",
        origin: publicOrigin,
        "x-forwarded-proto": "https",
        "x-otter-demo-session": firstSession,
      },
      payload: { inviteCode: previewCode, ...consent },
    });
    expect(response.statusCode).toBe(200);
  });

  it("enforces the configured concurrent preview capacity", async () => {
    const redeem = (session: string) => app.inject({
      method: "POST", url: "/api/auth/redeem-invite", headers: { "x-otter-demo-session": session },
      payload: { inviteCode: previewCode, ...consent },
    });
    expect((await redeem(firstSession)).statusCode).toBe(200);
    const capacity = await redeem(secondSession);
    expect(capacity.statusCode).toBe(503);
    expect(capacity.json().error.code).toBe("PREVIEW_CAPACITY_REACHED");
  });
});
