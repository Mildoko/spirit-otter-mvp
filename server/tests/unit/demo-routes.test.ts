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
    const conversationId = bootstrap.json().conversation.id as string;
    const blended = await app.inject({ method: "POST", url: "/api/chat/turn", payload: { conversationId, text: "请帮我整理事情。" } });
    expect(blended.statusCode).toBe(200);
    expect(blended.json().responseSource).toBe("local_fallback");
    expect(blended.json().emotionDiagnostics).toBeTruthy();
    expect(blended.json().characterDiagnostics.activeSpirit).toBe("shore_pick");
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
    expect(response.json()).not.toHaveProperty("characterDiagnostics");
    expect((await app.inject({ method: "DELETE", url: "/api/me/data" })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/session/bootstrap" })).json().messages).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/api/me/export" })).json().memories).toEqual([]);
  });

  it("exposes safe runtime metadata", async () => {
    expect((await app.inject({ method: "GET", url: "/api/runtime" })).json()).toEqual({
      mode: "demo", persistent: false, modelSource: "local_fallback", buildVersion: "test-version", emotionDiagnosticsAvailable: true,
    });
  });
});
