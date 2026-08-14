import type { PrismaClient, Prisma } from "@prisma/client";
import { addDays } from "../utils.js";
import { RECORD_DAYS } from "../config/constants.js";

type BehaviorDb = PrismaClient | Prisma.TransactionClient;

export async function logBehavior(
  db: BehaviorDb,
  userId: string,
  eventType: string,
  metadata?: Record<string, string | number | boolean | null>,
  durationMs?: number,
): Promise<void> {
  await db.behaviorEvent.create({
    data: {
      userId,
      eventType,
      ...(metadata ? { metadataJson: metadata } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      expiresAt: addDays(new Date(), RECORD_DAYS),
    },
  });
}
