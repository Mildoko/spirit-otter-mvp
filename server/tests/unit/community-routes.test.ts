import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { DemoStore } from "../../src/demo/store.js";

describe("outer circle v0.1 public boundary", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      OTTER_RUNTIME_MODE: "demo",
      DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "outer-circle-test-secret-more-than-thirty-two-chars",
      COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:3001",
      LLM_API_KEY: "",
      BUILD_VERSION: "outer-circle-test",
    });
    app = await buildApp(env, undefined, { demoStore: new DemoStore() });
    await app.ready();
  });

  afterEach(async () => app.close());

  it("returns only curated demo content with every social write capability disabled", async () => {
    const response = await app.inject({ method: "GET", url: "/api/community/v0.1/public-feed" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      circle: "outer_public",
      dataStatus: "demo",
      capabilities: {
        signup: false,
        contact: false,
        post: false,
        joinGroup: false,
        personalizedRecommendation: false,
      },
      items: [
        { lane: "happening_now", laneLabel: "正在发生", dataStatus: "demo" },
        { lane: "possibly_relevant", laneLabel: "与你可能有关", dataStatus: "demo" },
        { lane: "wander", laneLabel: "随便看看", dataStatus: "demo" },
      ],
    });
  });

  it("keeps private inner-circle fields outside the public response contract", async () => {
    const response = await app.inject({ method: "GET", url: "/api/community/v0.1/public-feed" });
    const serialized = JSON.stringify(response.json()).toLowerCase();
    for (const forbidden of [
      "conversation", "message", "memory", "emotion", "astrology", "bazi",
      "contactinfo", "contactdetail", "phone", "email", "exactlocation", "userid", "researchid",
    ]) {
      expect(serialized).not.toContain(`\"${forbidden}\"`);
    }
  });

  it("returns a public detail and rejects unknown items or any query payload", async () => {
    const detail = await app.inject({ method: "GET", url: "/api/community/v0.1/public-items/night-lantern-walk" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: "night-lantern-walk", sourceLabel: "BoonZoom 演示目录" });

    expect((await app.inject({ method: "GET", url: "/api/community/v0.1/public-items/not-here" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/community/v0.1/public-feed?message=private" })).statusCode).toBe(400);
  });

  it("does not expose social write endpoints in the read-only prototype", async () => {
    for (const url of [
      "/api/community/v0.1/signup",
      "/api/community/v0.1/contact",
      "/api/community/v0.1/posts",
      "/api/community/v0.1/groups/join",
    ]) {
      expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(404);
    }
  });
});
