import type { PrismaClient, Prisma } from "@prisma/client";
import { addDays } from "../utils.js";
import { RECORD_DAYS } from "../config/constants.js";
import {
  assertEventKey,
  CORE_DIALOGUE_EVENT_VERSION,
  parseCoreDialogueEventMetadata,
  type CoreDialogueEventInput,
  type CoreDialogueEventName,
} from "../events/core-dialogue-events.js";

type BehaviorDb = PrismaClient | Prisma.TransactionClient;

export async function logCoreDialogueEvent<Name extends CoreDialogueEventName>(
  db: BehaviorDb,
  userId: string,
  input: CoreDialogueEventInput<Name>,
): Promise<void> {
  await logCoreDialogueEvents(db, userId, [input]);
}

export async function logCoreDialogueEvents(
  db: BehaviorDb,
  userId: string,
  inputs: CoreDialogueEventInput[],
): Promise<void> {
  if (!inputs.length) return;
  await db.behaviorEvent.createMany({
    data: inputs.map((input) => {
      const eventKey = assertEventKey(input.eventKey);
      const metadata = parseCoreDialogueEventMetadata(input.eventName, input.metadata);
      const occurredAt = input.occurredAt ?? new Date();
      return {
        userId,
        eventKey,
        eventType: input.eventName,
        eventVersion: CORE_DIALOGUE_EVENT_VERSION,
        metadataJson: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
        occurredAt,
        isReplay: input.isReplay ?? false,
        expiresAt: addDays(occurredAt, RECORD_DAYS),
      };
    }),
    skipDuplicates: true,
  });
}
