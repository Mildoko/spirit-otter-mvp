import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import { requireAuth } from "../services/session-service.js";
import { AzureSpeechService } from "../services/azure-speech-service.js";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  profileId: z.enum([
    "zen_deer.deep_tide", "zen_deer.shore_pick", "zen_deer.safety_plain", "zen_deer.welcome",
    "spirit_otter.warm_companion", "spirit_otter.caring_clear", "spirit_otter.safety_plain", "spirit_otter.welcome",
    "bird_courier.concierge", "bird_courier.recommendation", "bird_courier.safety_plain", "bird_courier.welcome",
    "spirit_otter.deep_tide", "spirit_otter.shore_pick", "tata.welcome",
  ]),
}).strict();

const welcomeTexts = [
  "你好，我是鹿禅。水静下来，话便可以慢慢说。",
  "又见面了。未尽的话，不必赶着说完。",
  "今日再会。心里哪一处有声，就从哪一处说。",
  "昨天已过。今天的你，落在何处？",
  "有几天没见。此刻回来，便是此刻。",
  "久别再会。先坐一会儿，不必急着有答案。",
  "嗨，我是 tata。你可以先在这里歇一会儿。",
  "你好，我是飞儿。把要记的、要找的交给我就好。",
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
      if (!allowed) return reply.code(403).send({ error: { code: "SPEECH_TEXT_NOT_ALLOWED", message: "只能朗读角色已经说过的话" } });
    }
    const audio = await speech.synthesize(body.text, body.profileId);
    return reply.type("audio/mpeg").header("Cache-Control", "private, max-age=86400").send(audio);
  });
}
