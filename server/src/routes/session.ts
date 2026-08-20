import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../config/env.js";
import { requireAuth } from "../services/session-service.js";
import { logCoreDialogueEvent } from "../services/behavior-service.js";
import { RECORD_DAYS } from "../config/constants.js";
import { addDays } from "../utils.js";
import { randomUUID } from "node:crypto";
import { followupReentryBucket } from "../events/core-dialogue-events.js";

export function registerSessionRoutes(app: FastifyInstance, db: PrismaClient, env: AppEnv): void {
  app.get("/api/session/bootstrap", async (request) => {
    const auth = await requireAuth(request, db, env);
    const user = await db.anonymousUser.findUniqueOrThrow({ where: { id: auth.userId }, select: { lastActiveAt: true, createdAt: true } });
    const conversation = await db.conversation.findFirstOrThrow({
      where: { userId: auth.userId },
      orderBy: { updatedAt: "desc" },
    });
    const [rawMessages, actions, followups] = await Promise.all([
      db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 12 }),
      db.actionItem.findMany({
        where: { conversationId: conversation.id, status: { in: ["draft", "confirmed", "completed", "deferred"] } },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.followupTask.findMany({
        where: { conversationId: conversation.id, status: { in: ["pending", "deferred"] }, dueAt: { lte: new Date() } },
        include: { action: true },
        orderBy: { dueAt: "asc" },
      }),
    ]);
    if (followups.length > 0) {
      await db.$transaction(async (tx) => {
        await tx.followupTask.updateMany({
          where: { id: { in: followups.filter((item) => !item.shownAt).map((item) => item.id) } },
          data: { shownAt: new Date() },
        });
        for (const item of followups.filter((entry) => !entry.shownAt)) {
          await logCoreDialogueEvent(tx, auth.userId, {
            eventName: "followup_reentered",
            eventKey: `followup:${item.id}:followup_reentered`,
            metadata: {
              sessionId: auth.sessionId,
              conversationId: conversation.id,
              followupId: item.id,
              reentryAfterDueHoursBucket: followupReentryBucket(Date.now() - item.dueAt.getTime()),
            },
          });
        }
      });
    }
    const now = new Date();
    await db.anonymousUser.update({
      where: { id: auth.userId },
      data: { lastActiveAt: now, expiresAt: addDays(now, RECORD_DAYS) },
    });
    return {
      researchId: auth.researchId,
      researchContact: env.RESEARCH_CONTACT,
      aiReminder: "你正在与 AI 系统互动，它不能替代专业医疗或现实中的紧急帮助。",
      visit: {
        visitId: randomUUID(),
        currentVisitAt: now.toISOString(),
        previousVisitAt: user.lastActiveAt.toISOString(),
        isReturning: user.lastActiveAt.getTime() - user.createdAt.getTime() > 1000,
      },
      conversation: { id: conversation.id },
      messages: rawMessages.reverse().map((message) => ({ ...message, createdAt: message.createdAt.toISOString() })),
      actions: actions.map((action) => ({ ...action, createdAt: action.createdAt.toISOString(), updatedAt: action.updatedAt.toISOString() })),
      followups: followups.map((item) => ({
        id: item.id,
        actionId: item.actionId,
        dueAt: item.dueAt.toISOString(),
        status: item.status,
        outcomeState: item.outcomeState,
        outcomeLabeledAt: item.outcomeLabeledAt?.toISOString() ?? null,
        action: { ...item.action, createdAt: item.action.createdAt.toISOString() },
      })),
    };
  });
}
