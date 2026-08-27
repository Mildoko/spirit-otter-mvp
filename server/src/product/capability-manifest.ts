import type {
  AgentIdV1,
  CapabilityManifestV1,
  CapabilityStatusV1,
  ProductCapabilityV1,
} from "@otter/shared";
import type { AppEnv } from "../config/env.js";

const allAgents: AgentIdV1[] = ["zen_deer", "spirit_otter", "bird_courier"];

function enabledStatus(enabled: boolean, mode: AppEnv["OTTER_RUNTIME_MODE"]): CapabilityStatusV1 {
  if (!enabled) return "unavailable";
  return mode === "full" ? "available" : "demo_only";
}

function feature(
  id: ProductCapabilityV1["id"],
  status: CapabilityStatusV1,
  dataMode: ProductCapabilityV1["dataMode"],
  requiresExplicitAuthorization: boolean,
  agentIds: AgentIdV1[] = allAgents,
  reasonCode?: ProductCapabilityV1["reasonCode"],
): ProductCapabilityV1 {
  return { id, status, dataMode, requiresExplicitAuthorization, agentIds, ...(reasonCode ? { reasonCode } : {}) };
}

export function createCapabilityManifest(env: AppEnv): CapabilityManifestV1 {
  const mode = env.OTTER_RUNTIME_MODE;
  const persistent = mode === "full";
  const voiceStatus = enabledStatus(env.AUDIO_V1, mode);
  const memoryStatus = enabledStatus(env.MEMORY_V2, mode);
  const sceneStatus = enabledStatus(env.SCENE_WORLD_V1, mode);
  const feedbackStatus: CapabilityStatusV1 = mode === "full" ? "available" : mode === "demo" ? "demo_only" : "unavailable";

  return {
    schemaVersion: 1,
    manifestVersion: "capability-manifest-v1",
    runtimeMode: mode,
    agents: allAgents.map((agentId) => ({
      agentId,
      chat: mode === "lab" ? "demo_only" : "available",
      voicePlayback: voiceStatus,
      longTermMemory: memoryStatus,
      externalActions: "unavailable",
    })),
    capabilities: [
      feature("agent.chat", mode === "lab" ? "demo_only" : "available", persistent ? "persistent" : "ephemeral", false),
      feature("voice.playback", voiceStatus, "none", false, allAgents, env.AUDIO_V1 ? undefined : "feature_disabled"),
      feature("memory.long_term", memoryStatus, memoryStatus === "available" ? "persistent" : memoryStatus === "demo_only" ? "ephemeral" : "none", true, allAgents, env.MEMORY_V2 ? undefined : "feature_disabled"),
      feature("community.read", "demo_only", "none", false, allAgents, "research_only"),
      feature("community.write", "unavailable", "none", true, allAgents, "not_implemented"),
      feature("external_action", "unavailable", "none", true, allAgents, "not_implemented"),
      feature("feedback.voluntary", feedbackStatus, persistent ? "persistent" : feedbackStatus === "demo_only" ? "ephemeral" : "none", false, allAgents, mode === "lab" ? "runtime_mode" : undefined),
      feature("scene.world", sceneStatus, "none", false, allAgents, env.SCENE_WORLD_V1 ? undefined : "feature_disabled"),
    ],
  };
}
