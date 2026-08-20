import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../config/env.js";
import { RECORD_DAYS, SESSION_COOKIE, SESSION_DAYS } from "../config/constants.js";
import { addDays, hashSecret, randomResearchId, randomToken } from "../utils.js";
import { logCoreDialogueEvent } from "../services/behavior-service.js";
import { requireAuth } from "../services/session-service.js";

const redeemSchema = z.object({
  inviteCode: z.string().min(6).max(64),
  adultConfirmed: z.literal(true),
  aiDisclosureAccepted: z.literal(true),
  cloudProcessingAccepted: z.literal(true),
  dataConsentAccepted: z.literal(true),
});

export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.post("/api/auth/redeem-invite", {
    config: { rateLimit: { max: env.NODE_ENV === "test" ? 1200 : 8, timeWindow: "10 minutes" } },
  }, async (request, reply) => {
    const body = redeemSchema.parse(request.body);
    const now = new Date();
    const codeHash = hashSecret(body.inviteCode.trim().toUpperCase(), env.SESSION_SECRET);
    const invite = await db.inviteCode.findUnique({ where: { codeHash } });
    if (!invite || invite.usedAt || invite.expiresAt <= now) {
      return reply.code(400).send({ error: { code: "INVALID_INVITE", message: "邀请码无效、已使用或已过期" } });
    }

    const token = randomToken();
    const tokenHash = hashSecret(token, env.SESSION_SECRET);
    const expiresAt = addDays(now, SESSION_DAYS);
    const result = await db.$transaction(async (tx) => {
      const user = await tx.anonymousUser.create({
        data: {
          researchId: randomResearchId(),
          adultConfirmedAt: now,
          aiDisclosureAcceptedAt: now,
          cloudProcessingAcceptedAt: now,
          dataConsentAcceptedAt: now,
          expiresAt,
        },
      });
      const claimed = await tx.inviteCode.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: now, usedById: user.id },
      });
      if (claimed.count !== 1) throw Object.assign(new Error("邀请码已被使用"), { statusCode: 409 });
      const session = await tx.session.create({ data: { tokenHash, userId: user.id, expiresAt } });
      const conversation = await tx.conversation.create({ data: { userId: user.id } });
      await logCoreDialogueEvent(tx, user.id, {
        eventName: "session_started",
        eventKey: `session:${session.id}:session_started`,
        metadata: { sessionId: session.id, entrySurface: "web", inviteCodePresent: true, hasOpenFollowup: false, hasConfirmedAction: false },
        occurredAt: now,
      });
      return { researchId: user.researchId, conversationId: conversation.id };
    });

    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      expires: expiresAt,
    });
    return reply.code(201).send(result);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const auth = await requireAuth(request, db, env);
    await db.$transaction(async (tx) => {
      await logCoreDialogueEvent(tx, auth.userId, {
        eventName: "session_ended",
        eventKey: `session:${auth.sessionId}:session_ended`,
        metadata: { sessionId: auth.sessionId, endReason: "user_exit" },
      });
      await tx.session.delete({ where: { id: auth.sessionId } });
    });
    reply.clearCookie(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
    });
    return reply.code(204).send();
  });
}
