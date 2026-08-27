import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { createCapabilityManifest } from "../../src/product/capability-manifest.js";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused/unused",
  SESSION_SECRET: "capability-test-secret-with-more-than-thirty-two-characters",
  LLM_API_KEY: "",
};

describe("capability manifest v1", () => {
  it("never claims community writes or external actions", () => {
    for (const mode of ["full", "demo", "lab"] as const) {
      const manifest = createCapabilityManifest(loadEnv({ ...base, OTTER_RUNTIME_MODE: mode }));
      expect(manifest.capabilities.find((item) => item.id === "community.write")?.status).toBe("unavailable");
      expect(manifest.capabilities.find((item) => item.id === "external_action")?.status).toBe("unavailable");
      expect(manifest.agents.every((agent) => agent.externalActions === "unavailable")).toBe(true);
    }
  });

  it("distinguishes persistent full capabilities from ephemeral demo capabilities", () => {
    const full = createCapabilityManifest(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full", MEMORY_V2: "true" }));
    expect(full.capabilities.find((item) => item.id === "memory.long_term")).toMatchObject({ status: "available", dataMode: "persistent" });

    const demo = createCapabilityManifest(loadEnv({ ...base, OTTER_RUNTIME_MODE: "demo" }));
    expect(demo.capabilities.find((item) => item.id === "memory.long_term")).toMatchObject({ status: "demo_only", dataMode: "ephemeral" });
    expect(demo.capabilities.find((item) => item.id === "feedback.voluntary")).toMatchObject({ status: "demo_only", dataMode: "ephemeral" });
  });

  it("keeps every public agent aligned with feature flags", () => {
    const manifest = createCapabilityManifest(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full", AUDIO_V1: "false", MEMORY_V2: "false" }));
    expect(manifest.agents).toHaveLength(3);
    expect(manifest.agents.every((agent) => agent.chat === "available")).toBe(true);
    expect(manifest.agents.every((agent) => agent.voicePlayback === "unavailable" && agent.longTermMemory === "unavailable")).toBe(true);
  });
});
