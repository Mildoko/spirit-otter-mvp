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

  it("keeps scene world off in full and on in demo/lab unless explicitly overridden", () => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }).SCENE_WORLD_V1).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }).SCENE_WORLD_V1).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "lab", SCENE_WORLD_V1: "false" }).SCENE_WORLD_V1).toBe(false);
  });

  it("keeps audio off in full/lab and on in demo unless explicitly overridden", () => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }).AUDIO_V1).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }).AUDIO_V1).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "lab" }).AUDIO_V1).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo", AUDIO_V1: "false" }).AUDIO_V1).toBe(false);
  });

  it("keeps memory v2 off in full and on in demo/lab unless explicitly overridden", () => {
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }).MEMORY_V2).toBe(false);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }).MEMORY_V2).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "lab" }).MEMORY_V2).toBe(true);
    expect(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo", MEMORY_V2: "false" }).MEMORY_V2).toBe(false);
  });

  it("keeps astrology skill off unless explicitly enabled", () => {
    expect(loadEnv(base).ASTROLOGY_SKILL_V1).toBe(false);
    expect(loadEnv({ ...base, ASTROLOGY_SKILL_V1: "true" }).ASTROLOGY_SKILL_V1).toBe(true);
  });

  it("maps legacy local test mode to lab", () => {
    expect(loadEnv({ ...base, LOCAL_TEST_MODE: "true" }).OTTER_RUNTIME_MODE).toBe("lab");
  });

  it("rejects non-full production modes", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", OTTER_RUNTIME_MODE: "demo", LLM_API_KEY: "configured" })).toThrow(/full/);
  });

  it("rejects a placeholder safety contact in production", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", OTTER_RUNTIME_MODE: "full", LLM_API_KEY: "configured" })).toThrow(/RESEARCH_CONTACT/);
    expect(loadEnv({ ...base, NODE_ENV: "production", OTTER_RUNTIME_MODE: "full", LLM_API_KEY: "configured", RESEARCH_CONTACT: "拨打项目安全热线 400-000-0000" }).RESEARCH_CONTACT).toContain("安全热线");
  });

  it("requires the official configured DeepSeek channel for external preview", () => {
    const preview = {
      ...base,
      OTTER_RUNTIME_MODE: "demo",
      EXTERNAL_PREVIEW_ENABLED: "true",
      EXTERNAL_PREVIEW_CODE: "OTTER-PREVIEW-ABC123",
    };
    expect(() => loadEnv(preview)).toThrow(/DeepSeek API/);
    expect(() => loadEnv({ ...preview, LLM_API_KEY: "configured", LLM_PROVIDER: "other" })).toThrow(/DeepSeek/);
    expect(() => loadEnv({ ...preview, LLM_API_KEY: "configured", LLM_BASE_URL: "https://example.com" })).toThrow(/官方/);
    expect(() => loadEnv({ ...preview, LLM_API_KEY: "configured", LLM_MODEL: "deepseek-chat" })).toThrow(/deepseek-v4/);
    expect(loadEnv({ ...preview, LLM_API_KEY: "configured", LLM_MODEL: "deepseek-v4-flash" }).EXTERNAL_PREVIEW_ENABLED).toBe(true);
  });

  it("requires complete HTTPS Langfuse configuration when metadata tracing is enabled", () => {
    expect(() => loadEnv({ ...base, AI_OBSERVABILITY_ENABLED: "true" })).toThrow(/LANGFUSE/);
    expect(() => loadEnv({ ...base, AI_OBSERVABILITY_ENABLED: "true", LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", LANGFUSE_BASE_URL: "http://langfuse.local" })).toThrow(/HTTPS/);
    expect(loadEnv({ ...base, AI_OBSERVABILITY_ENABLED: "true", LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" }).AI_OBSERVABILITY_ENABLED).toBe(true);
  });
});
