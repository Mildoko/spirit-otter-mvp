import type { PrismaClient } from "@prisma/client";
import { cleanupExpiredAgentHandoffs } from "../modules/p2/agent-handoff-repository.js";

export interface CleanupResult {
  expiredMemories: number;
  expiredTurns: number;
  expiredActions: number;
  expiredFollowups: number;
  expiredBehaviorEvents: number;
  expiredSessions: number;
  expiredUsers: number;
  expiredAgentHandoffs: number;
}

export async function cleanupExpiredData(db: PrismaClient, now = new Date()): Promise<CleanupResult> {
  return db.$transaction(async (tx) => {
    const expiredAgentHandoffs = await cleanupExpiredAgentHandoffs(tx, now);
    const memories = await tx.memoryItem.deleteMany({ where: { expiresAt: { lte: now } } });
    const followups = await tx.followupTask.deleteMany({ where: { expiresAt: { lte: now } } });
    const actions = await tx.actionItem.deleteMany({ where: { expiresAt: { lte: now } } });
    const turns = await tx.turn.deleteMany({ where: { expiresAt: { lte: now } } });
    const behaviors = await tx.behaviorEvent.deleteMany({ where: { expiresAt: { lte: now } } });
    const sessions = await tx.session.deleteMany({ where: { expiresAt: { lte: now } } });
    const users = await tx.anonymousUser.deleteMany({ where: { expiresAt: { lte: now } } });
    return {
      expiredMemories: memories.count,
      expiredTurns: turns.count,
      expiredActions: actions.count,
      expiredFollowups: followups.count,
      expiredBehaviorEvents: behaviors.count,
      expiredSessions: sessions.count,
      expiredUsers: users.count,
      expiredAgentHandoffs,
    };
  });
}
