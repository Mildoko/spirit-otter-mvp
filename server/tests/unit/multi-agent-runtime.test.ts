import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { DemoStore } from "../../src/demo/store.js";

describe("three-agent selectable runtime", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      OTTER_RUNTIME_MODE: "demo",
      DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "three-agent-test-secret-with-more-than-thirty-two-chars",
      COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:3001",
      LLM_API_KEY: "",
      BUILD_VERSION: "three-agent-test",
    });
    app = await buildApp(env, undefined, { demoStore: new DemoStore() });
    await app.ready();
  });

  afterEach(async () => app.close());

  it("lets the user choose tata and receives a warm tata reply and voice", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat/turn",
      payload: { conversationId: bootstrap.json().conversation.id, text: "今天真的很累", agentId: "spirit_otter" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      activeAgentId: "spirit_otter",
      reply: { role: "assistant", agentId: "spirit_otter" },
      audioCue: { agentId: "spirit_otter" },
    });
    expect(response.json().reply.content).toContain("消耗");
    expect(response.json().reply.content).not.toMatch(/公案|八字|命理/u);
  });

  it("lets the user choose 飞儿 without silently saving an interest", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat/turn",
      payload: { conversationId: bootstrap.json().conversation.id, text: "我喜欢城市摄影", agentId: "bird_courier" },
    });
    expect(response.json()).toMatchObject({
      activeAgentId: "bird_courier",
      reply: { agentId: "bird_courier" },
      audioCue: { agentId: "bird_courier" },
    });
    expect(response.json().reply.content).toContain("不会直接");
    expect(response.json().reply.content).not.toMatch(/已保存|已经记入/u);
    expect((await app.inject({ method: "GET", url: "/api/me/export" })).json().memories).toEqual([]);
    const refreshed = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    expect(refreshed.json().conversation.activeAgentId).toBe("bird_courier");
    expect(refreshed.json().messages.at(-1)).toMatchObject({ role: "assistant", agentId: "bird_courier" });
  });

  it("keeps high-risk support plain while preserving the selected voice channel", async () => {
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap" });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat/turn",
      payload: { conversationId: bootstrap.json().conversation.id, text: "我马上要从楼顶跳下去。", agentId: "bird_courier" },
    });
    expect(response.json()).toMatchObject({
      activeAgentId: "bird_courier",
      safety: "direct_support",
      responseSource: "static_safety",
      audioCue: { agentId: "bird_courier", voiceProfileId: "bird_courier.safety_plain", soundscapePolicy: "silent" },
      visualCue: { agentId: "bird_courier", action: "safety_still" },
    });
  });
});
