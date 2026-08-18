import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

const base = { DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", LLM_API_KEY: "" };

describe("runtime mode environment", () => {
  it.each(["full", "demo", "lab"] as const)("accepts %s", (mode) => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: mode }).OTTER_RUNTIME_MODE).toBe(mode);
  });

  it("keeps expression v2 off in full and on in demo/lab unless explicitly overridden", () => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }).EXPRESSION_STYLE_V2).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }).EXPRESSION_STYLE_V2).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "lab", EXPRESSION_STYLE_V2: "false" }).EXPRESSION_STYLE_V2).toBe(false);
  });

  it("keeps emotion inference v2 off in full and on in demo/lab unless explicitly overridden", () => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }).EMOTION_INFERENCE_V2).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }).EMOTION_INFERENCE_V2).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "lab", EMOTION_INFERENCE_V2: "false" }).EMOTION_INFERENCE_V2).toBe(false);
  });

  it("maps legacy local test mode to lab", () => {
    expect(loadEnv({ ...base, LOCAL_TEST_MODE: "true" }).OTTER_RUNTIME_MODE).toBe("lab");
  });

  it("rejects non-full production modes", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", OTTER_RUNTIME_MODE: "demo", LLM_API_KEY: "configured" })).toThrow(/full/);
  });
});
