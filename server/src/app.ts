import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "./config/env.js";
import { prisma } from "./db/client.js";
import { LlmGateway } from "./modules/support/llm-gateway.js";
import { SupportOrchestrator } from "./modules/support/orchestrator.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerActionRoutes } from "./routes/actions.js";
import { registerFollowupRoutes } from "./routes/followups.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerSafetyRoutes } from "./routes/safety.js";
import { registerDevRoutes } from "./routes/dev.js";
import { registerRuntimeRoute } from "./routes/runtime.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { DemoStore } from "./demo/store.js";
import { validateCharacterRegistry } from "./modules/character/schemas.js";
import { validateServerVoiceProfileRegistry } from "./modules/support/audio-cue.js";
import { registerSpeechRoute } from "./routes/speech.js";
import { registerHealingRoutes } from "./routes/healing.js";
import { registerCommunityRoutes } from "./routes/community.js";
import { createAiTelemetry, type AiTelemetry } from "./observability/ai-telemetry.js";

export interface AppDependencies {
  orchestrator?: Pick<SupportOrchestrator, "run">;
  demoStore?: DemoStore;
  aiTelemetry?: AiTelemetry;
}

export async function buildApp(env: AppEnv, db: PrismaClient = prisma, dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  validateCharacterRegistry();
  validateServerVoiceProfileRegistry();
  const app = Fastify({
    // External preview only listens on loopback and is reached through cloudflared.
    // Trust the loopback proxy so request.protocol reflects X-Forwarded-Proto=https
    // and same-origin writes are not rejected as http/https mismatches.
    trustProxy: env.EXTERNAL_PREVIEW_ENABLED ? "127.0.0.1" : false,
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "body.text", "body.LLM_API_KEY"],
    },
    bodyLimit: 32_000,
  });

  await app.register(cookie);
  await app.register(cors, { origin: env.OTTER_RUNTIME_MODE === "demo" ? true : env.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: env.LOCAL_TEST_MODE ? 1200 : 120, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request, reply) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    const requestOrigin = `${request.protocol}://${request.headers.host}`;
    const allowedOrigin = env.OTTER_RUNTIME_MODE === "demo" ? requestOrigin : env.WEB_ORIGIN;
    if (origin && origin !== allowedOrigin) {
      return reply.code(403).send({ error: { code: "ORIGIN_REJECTED", message: "请求来源不被允许" } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const caught = error as Error & { statusCode?: number; code?: string };
    const statusCode = error instanceof ZodError ? 400 : (caught.statusCode ?? 500);
    const code = error instanceof ZodError ? "VALIDATION_ERROR" : (caught.code ?? "INTERNAL_ERROR");
    if (statusCode >= 500) request.log.error({ err: error, code }, "request failed");
    reply.code(statusCode).send({
      error: {
        code,
        message: statusCode >= 500 ? "服务暂时不可用，请稍后重试" : caught.message,
      },
    });
  });

  const aiTelemetry = dependencies.aiTelemetry ?? createAiTelemetry(env);
  if (!dependencies.aiTelemetry) app.addHook("onClose", async () => aiTelemetry.shutdown());
  const gateway = new LlmGateway(env, aiTelemetry);
  if (env.NODE_ENV === "production" && env.OTTER_RUNTIME_MODE === "full") {
    const probe = await gateway.probe();
    if (!probe.ok) throw new Error(`模型兼容探测失败：${probe.reason ?? "unknown"}`);
  }
  const orchestrator = dependencies.orchestrator ?? new SupportOrchestrator(gateway, env);
  registerRuntimeRoute(app, env, gateway);
  registerCommunityRoutes(app);
  registerSpeechRoute(app, env, db);
  if (env.OTTER_RUNTIME_MODE === "full") {
    registerHealthRoute(app, db);
    registerAuthRoutes(app, db, env);
    registerSessionRoutes(app, db, env);
    registerChatRoutes(app, db, env, orchestrator);
    registerActionRoutes(app, db, env, aiTelemetry);
    registerFollowupRoutes(app, db, env, aiTelemetry);
    registerMeRoutes(app, db, env);
    registerHealingRoutes(app, db, env);
    registerSafetyRoutes(app, db, env);
  } else if (env.OTTER_RUNTIME_MODE === "demo") {
    const demoStore = dependencies.demoStore ?? new DemoStore();
    demoStore.configureStateEngines({ action: env.ACTION_ENGINE_MODE, followup: env.FOLLOWUP_ENGINE_MODE, telemetry: aiTelemetry });
    registerDemoRoutes(app, env, orchestrator, demoStore);
  } else {
    registerHealthRoute(app, db);
    registerDevRoutes(app, env, orchestrator);
  }
  return app;
}
