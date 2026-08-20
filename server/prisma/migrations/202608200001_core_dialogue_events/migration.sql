ALTER TABLE "behavior_events"
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "eventVersion" TEXT NOT NULL DEFAULT 'legacy-v0',
  ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "isReplay" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "behavior_events_eventKey_key" ON "behavior_events"("eventKey");
CREATE INDEX "behavior_events_eventType_occurredAt_idx" ON "behavior_events"("eventType", "occurredAt");

ALTER TABLE "behavior_events" ALTER COLUMN "eventVersion" SET DEFAULT 'event-v1';
