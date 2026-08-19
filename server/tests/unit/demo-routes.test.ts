import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

describe("demo mode API contract", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    const env = loadEnv({
      NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "demo-test-secret-with-more-than-thirty-two-characters", COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:3001", LLM_API_KEY: "", BUILD_VERSION: "test-version",
    });
    app = await buildApp(env);
    await app.ready();
  });
  afterEach(async () => app.close());

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
      schemaVersion: 1, agentId: "spirit_otter", voiceProfileId: "spirit_otter.shore_pick", soundscapePolicy: "normal",
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
    expect((await app.inject({ method: "GET", url: "/api/runtime" })).json()).toEqual({
      mode: "demo", persistent: false, modelSource: "local_fallback", buildVersion: "test-version", emotionDiagnosticsAvailable: true, sceneWorldV1Enabled: true, audioV1Enabled: true, cloudTtsEnabled: false,
    });
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
    expect(firstMessages.at(-1).content).toContain("先不继续追问");

    const secondBootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: headers(secondSession) });
    expect(secondBootstrap.json().messages).toEqual([]);
    await app.inject({ method: "DELETE", url: "/api/me/data", headers: headers(firstSession) });
    const reset = await app.inject({ method: "POST", url: "/api/chat/turn", headers: headers(firstSession), payload: { conversationId: firstConversation, text: "不知道说什么" } });
    expect(reset.json().reply.content).not.toContain("先不继续追问");
  });
});
