import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { buildPublicEmotionFeedback } from "../modules/support/emotion-feedback.js";

const evaluateSchema = z.object({
  text: z.string().trim().min(1).max(6000),
  intent: z.enum(["auto", "talk", "organize"]).default("auto"),
  currentMode: z.enum(["companion", "organize"]).default("companion"),
  transitionAccepted: z.boolean().default(false),
  recentContext: z.array(z.string().max(6000)).max(12).default([]),
});

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../../web/dist");
const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function registerDevRoutes(app: FastifyInstance, env: AppEnv, orchestrator: SupportOrchestrator): void {
  app.get("/", async (_request, reply) => {
    const html = await readFile(join(webDist, "index.html"));
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/assets/*", async (request, reply) => {
    const name = z.string().regex(/^[A-Za-z0-9._-]+$/).parse((request.params as { "*": string })["*"]);
    const asset = await readFile(join(webDist, "assets", name));
    return reply.type(contentTypes[extname(name)] ?? "application/octet-stream").send(asset);
  });

  app.get("/favicon.ico", async (_request, reply) => reply.code(204).send());

  app.get("/api/dev/status", async () => ({
    localTestMode: true,
    modelConfigured: Boolean(env.LLM_API_KEY),
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL,
  }));

  app.post("/api/dev/evaluate", async (request) => {
    const input = evaluateSchema.parse(request.body);
    const result = await orchestrator.run(input);
    return {
      ...result,
      ...(result.riskLevel === "high" || result.riskLevel === "imminent"
        ? {}
        : { emotionFeedback: buildPublicEmotionFeedback(result.state) }),
      source: result.metrics.length > 0 ? "cloud_model" : "local_fallback",
      warning: "仅限本地内容验收；内部状态和策略不得暴露到正式产品。",
    };
  });
}
