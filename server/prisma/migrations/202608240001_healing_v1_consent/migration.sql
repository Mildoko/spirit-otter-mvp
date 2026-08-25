ALTER TABLE "anonymous_users"
  ADD COLUMN "deepInterpretationAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deepInterpretationEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "behavior_events" ALTER COLUMN "eventVersion" SET DEFAULT 'event-v3';
