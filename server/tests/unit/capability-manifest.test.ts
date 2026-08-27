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

  it("keeps all P2 capabilities unavailable by default", () => {
    const manifest = createCapabilityManifest(loadEnv({ ...base, OTTER_RUNTIME_MODE: "full" }));
    for (const id of ["agent.handoff", "interest.profile", "activity.catalog", "recommendation.personalized"] as const) {
      expect(manifest.capabilities.find((item) => item.id === id)).toMatchObject({
        status: "unavailable",
        dataMode: "none",
        reasonCode: "feature_disabled",
      });
    }
  });

  it("does not advertise shadow P2 capabilities as available", () => {
    const manifest = createCapabilityManifest(loadEnv({
      ...base,
      OTTER_RUNTIME_MODE: "demo",
      AGENT_HANDOFF_MODE: "shadow",
      INTEREST_PROFILE_MODE: "shadow",
      ACTIVITY_CATALOG_MODE: "shadow",
      RECOMMENDATION_MODE: "shadow",
    }));
    const staged = manifest.capabilities.filter((item) => ["agent.handoff", "interest.profile", "activity.catalog", "recommendation.personalized"].includes(item.id));
    expect(staged).toHaveLength(4);
    expect(staged.every((item) => item.status === "unavailable" && item.reasonCode === "shadow_only" && item.dataMode === "none")).toBe(true);
  });

  it("does not claim configured-on P2 capabilities before their implementations are ready", () => {
    const full = createCapabilityManifest(loadEnv({
      ...base,
      OTTER_RUNTIME_MODE: "full",
      AGENT_HANDOFF_MODE: "on",
      INTEREST_PROFILE_MODE: "on",
      ACTIVITY_CATALOG_MODE: "on",
      RECOMMENDATION_MODE: "on",
    }));
    expect(full.capabilities.find((item) => item.id === "agent.handoff")).toMatchObject({ status: "unavailable", dataMode: "none", reasonCode: "not_implemented", requiresExplicitAuthorization: true });
    expect(full.capabilities.find((item) => item.id === "interest.profile")).toMatchObject({ status: "unavailable", dataMode: "none", reasonCode: "not_implemented", requiresExplicitAuthorization: true, agentIds: ["bird_courier"] });
    expect(full.capabilities.find((item) => item.id === "activity.catalog")).toMatchObject({ status: "unavailable", dataMode: "none", reasonCode: "not_implemented", requiresExplicitAuthorization: false, agentIds: ["bird_courier"] });
    expect(full.capabilities.find((item) => item.id === "recommendation.personalized")).toMatchObject({ status: "unavailable", dataMode: "none", reasonCode: "not_implemented", requiresExplicitAuthorization: true, agentIds: ["bird_courier"] });
    expect(full.capabilities.find((item) => item.id === "community.write")?.status).toBe("unavailable");
    expect(full.capabilities.find((item) => item.id === "external_action")?.status).toBe("unavailable");

  });
});
