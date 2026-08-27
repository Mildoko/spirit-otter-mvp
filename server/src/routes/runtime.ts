import type { FastifyInstance } from "fastify";
import type { RuntimeInfo } from "@otter/shared";
import type { AppEnv } from "../config/env.js";
import type { LlmGateway } from "../modules/support/llm-gateway.js";
import { resolveBuildVersion } from "../config/build-version.js";
import { createCapabilityManifest } from "../product/capability-manifest.js";

export function registerRuntimeRoute(app: FastifyInstance, env: AppEnv, gateway: LlmGateway): void {
  app.get("/api/runtime", async (): Promise<RuntimeInfo> => ({
    mode: env.OTTER_RUNTIME_MODE,
    persistent: env.OTTER_RUNTIME_MODE === "full",
    externalPreview: env.EXTERNAL_PREVIEW_ENABLED,
    modelSource: gateway.isConfigured ? "cloud_model" : "local_fallback",
    buildVersion: resolveBuildVersion(env.BUILD_VERSION),
    emotionDiagnosticsAvailable: env.OTTER_RUNTIME_MODE === "lab",
    sceneWorldV1Enabled: env.SCENE_WORLD_V1,
    audioV1Enabled: env.AUDIO_V1,
    cloudTtsEnabled: Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION),
    memoryV2Enabled: env.MEMORY_V2,
    capabilityManifest: createCapabilityManifest(env),
  }));
}
