-- Third phase: user-reported five-state follow-up outcome model.
CREATE TYPE "FollowupOutcomeState" AS ENUM ('not_started', 'partial_progress', 'completed', 'blocked', 'redefined');

ALTER TABLE "followup_tasks"
  ADD COLUMN "outcomeState" "FollowupOutcomeState" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "outcomeLabeledAt" TIMESTAMP(3),
  ADD COLUMN "outcomeRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "followup_tasks_conversationId_outcomeState_outcomeLabeledAt_idx"
  ON "followup_tasks"("conversationId", "outcomeState", "outcomeLabeledAt");

ALTER TABLE "behavior_events" ALTER COLUMN "eventVersion" SET DEFAULT 'event-v2';
