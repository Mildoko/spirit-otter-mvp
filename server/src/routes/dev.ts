import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";
import { buildPublicEmotionInterpretation } from "../modules/support/emotion-inference.js";
import { registerLocalWebRoutes } from "./local-web.js";
import { guidanceStateSchema } from "../modules/support/guidance-state.js";

const evaluateSchema = z.object({
  text: z.string().trim().min(1).max(6000),
  currentSpirit: z.enum(["deep_tide", "shore_pick"]).default("deep_tide"),
  spiritTurnCount: z.number().int().min(0).default(0),
  companionLockTurns: z.number().int().min(0).max(2).default(0),
  recentContext: z.array(z.string().max(6000)).max(12).default([]),
  guidanceState: guidanceStateSchema.optional(),
}).strict();

export function registerDevRoutes(app: FastifyInstance, env: AppEnv, orchestrator: Pick<SupportOrchestrator, "run">): void {
  registerLocalWebRoutes(app);

  app.get("/api/dev/status", async () => ({
    localTestMode: true,
    modelConfigured: Boolean(env.LLM_API_KEY),
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
  }));

  app.post("/api/dev/evaluate", async (request) => {
    const input = evaluateSchema.parse(request.body);
    const { guidanceState, ...baseInput } = input;
    const result = await orchestrator.run({
      ...baseInput,
      previousRawStates: [],
      memories: [],
      ...(guidanceState ? { guidanceState } : {}),
    });
    const isSafety = result.riskLevel === "high" || result.riskLevel === "imminent";
    const isCasualTopic = result.plan.sceneState === "surface_chat";
    return {
      ...result,
      ...(isSafety ? {} : {
        ...(isCasualTopic ? {} : { emotionFeedback: buildPublicEmotionFeedback(result.state) }),
        ...(env.EMOTION_INFERENCE_V2 && result.riskLevel === "low" && !isCasualTopic ? { emotionInterpretation: buildPublicEmotionInterpretation(result.emotionHypothesis) } : {}),
        characterDiagnostics: {
          activeSpirit: result.plan.activeSpirit,
          transitionStyle: result.plan.transitionStyle,
          reasonCodes: result.plan.routeReasonCodes,
          lockTurnsRemaining: result.nextCompanionLockTurns,
          characterVersion: result.characterVersion,
          ...(result.responseStyleDiagnostics ? { responseStyle: result.responseStyleDiagnostics } : {}),
        },
      }),
      source: result.responseSource === "cloud_model" ? "cloud_model" : "local_fallback",
      warning: "仅限本地内容验收；内部状态和策略不得暴露到正式产品。",
    };
  });
}
