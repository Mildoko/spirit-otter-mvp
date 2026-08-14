import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
  SESSION_SECRET: "content-lab-test-secret-longer-than-thirty-two-characters",
  LLM_API_KEY: "",
  COOKIE_SECURE: "false",
  WEB_ORIGIN: "http://localhost:5173",
  LOCAL_TEST_MODE: "true",
});
const app = await buildApp(env);

afterAll(async () => app.close());

describe("local content acceptance lab", () => {
  it("evaluates content without authentication or a database query", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/dev/evaluate",
      headers: { origin: env.WEB_ORIGIN },
      payload: {
        text: "我现在就在楼顶，马上要跳下去。",
        currentSpirit: "deep_tide",
        spiritTurnCount: 0,
        companionLockTurns: 0,
        recentContext: [],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().riskLevel).toBe("imminent");
    expect(response.json().plan.sceneState).toBe("safety_plain");
    expect(response.json().actionDraft).toBeNull();
    expect(response.json().source).toBe("local_fallback");
  });

  it("cannot be enabled in production", () => {
    expect(() => loadEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
      SESSION_SECRET: "content-lab-test-secret-longer-than-thirty-two-characters",
      LLM_API_KEY: "test-only-key",
      LOCAL_TEST_MODE: "true",
    })).toThrow("生产模式禁止启用 LOCAL_TEST_MODE");
  });
});
