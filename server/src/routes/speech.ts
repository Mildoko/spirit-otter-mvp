import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { requireAuth } from "../services/session-service.js";
import { AzureSpeechService } from "../services/azure-speech-service.js";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  profileId: z.enum(["spirit_otter.deep_tide", "spirit_otter.shore_pick", "spirit_otter.safety_plain", "tata.welcome"]),
}).strict();

const welcomeTexts = [
  "嗨，我是 tata。你来了。",
  "回来啦。刚才没说完的，也可以慢慢说。",
  "今天又见到你了。想说什么，我都在听。",
  "又见到你了。昨天之后，今天过得怎么样？",
  "有几天没见了。欢迎回来。",
  "好久不见。欢迎回来，不着急，我们慢慢来。",
];

export function registerSpeechRoute(app: FastifyInstance, env: AppEnv, db: PrismaClient): void {
  const speech = new AzureSpeechService(env);
  app.post("/api/audio/speech", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = bodySchema.parse(request.body);
    if (env.OTTER_RUNTIME_MODE === "full") {
      const auth = await requireAuth(request, db, env);
      const allowed = welcomeTexts.includes(body.text) || Boolean(await db.message.findFirst({
        where: { content: body.text, role: "assistant", conversation: { userId: auth.userId } },
        select: { id: true },
      }));
      if (!allowed) return reply.code(403).send({ error: { code: "SPEECH_TEXT_NOT_ALLOWED", message: "只能朗读 tata 已经说过的话" } });
    }
    const audio = await speech.synthesize(body.text, body.profileId);
    return reply.type("audio/mpeg").header("Cache-Control", "private, max-age=86400").send(audio);
  });
}
