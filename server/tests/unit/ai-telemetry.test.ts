import { describe, expect, it } from "vitest";
import { AI_TRACE_ATTRIBUTE_KEYS, createAiTelemetry } from "../../src/observability/ai-telemetry.js";
import { loadEnv } from "../../src/config/env.js";

describe("AI telemetry privacy contract", () => {
  it("has an allowlist with no content or identity attributes", () => {
    const keys = AI_TRACE_ATTRIBUTE_KEYS.join(" ");
    expect(keys).not.toMatch(/prompt|completion|user|session|conversation|memory|message|content/i);
  });

  it("is disabled by default and accepts no call payload", async () => {
    const telemetry = createAiTelemetry(loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://unused/unused",
      SESSION_SECRET: "telemetry-test-secret-with-more-than-thirty-two-characters",
      LLM_API_KEY: "",
    }));
    expect(telemetry.enabled).toBe(false);
    telemetry.startModelCall({ operation: "generate", provider: "test", model: "test", attempt: 1 })
      .finish({ outcome: "success", latencyMs: 1, promptTokens: 2, outputTokens: 3 });
    await telemetry.shutdown();
  });
});
