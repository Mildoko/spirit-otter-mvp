ALTER TABLE "conversations" ADD COLUMN "guidanceStateJson" JSONB;

ALTER TABLE "support_events"
  ADD COLUMN "signalFeaturesJson" JSONB,
  ADD COLUMN "responseStyleJson" JSONB;
