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
import { registerModeTransitionRoutes } from "./routes/mode-transitions.js";
import { registerActionRoutes } from "./routes/actions.js";
import { registerFollowupRoutes } from "./routes/followups.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerSafetyRoutes } from "./routes/safety.js";
import { registerDevRoutes } from "./routes/dev.js";

export async function buildApp(env: AppEnv, db: PrismaClient = prisma): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie", "body.text", "body.LLM_API_KEY"],
    },
    bodyLimit: 32_000,
  });

  await app.register(cookie);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: env.LOCAL_TEST_MODE ? 1200 : 120, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request, reply) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) {
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

  const gateway = new LlmGateway(env);
  const orchestrator = new SupportOrchestrator(gateway, env);
  registerHealthRoute(app, db);
  registerAuthRoutes(app, db, env);
  registerSessionRoutes(app, db, env);
  registerChatRoutes(app, db, env, orchestrator);
  registerModeTransitionRoutes(app, db, env);
  registerActionRoutes(app, db, env);
  registerFollowupRoutes(app, db, env);
  registerMeRoutes(app, db, env);
  registerSafetyRoutes(app, db, env);
  if (env.LOCAL_TEST_MODE) registerDevRoutes(app, env, orchestrator);
  return app;
}
