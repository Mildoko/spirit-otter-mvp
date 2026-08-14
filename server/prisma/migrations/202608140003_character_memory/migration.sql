CREATE TYPE "ActiveSpirit" AS ENUM ('deep_tide', 'shore_pick');
CREATE TYPE "MemoryKind" AS ENUM ('user_fact', 'user_preference', 'boundary', 'episode', 'relationship_milestone', 'support_strategy');
CREATE TYPE "MemoryOrigin" AS ENUM ('user_explicit', 'model_inference');
CREATE TYPE "MemorySensitivity" AS ENUM ('normal', 'personal', 'sensitive', 'highly_sensitive');
CREATE TYPE "MemoryStatus" AS ENUM ('active', 'superseded', 'expired', 'deleted');

ALTER TABLE "conversations"
  ADD COLUMN "activeSpirit" "ActiveSpirit" NOT NULL DEFAULT 'deep_tide',
  ADD COLUMN "spiritTurnCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "companionLockTurns" INTEGER NOT NULL DEFAULT 0;

UPDATE "conversations"
SET "activeSpirit" = CASE WHEN "mode" = 'organize' THEN 'shore_pick'::"ActiveSpirit" ELSE 'deep_tide'::"ActiveSpirit" END;

ALTER TABLE "support_events"
  ADD COLUMN "activeSpirit" "ActiveSpirit",
  ADD COLUMN "transitionStyle" TEXT NOT NULL DEFAULT 'steady',
  ADD COLUMN "routeReasonsJson" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "characterVersion" TEXT NOT NULL DEFAULT 'legacy';

UPDATE "support_events"
SET "activeSpirit" = CASE WHEN "surfaceMode" = 'organize' THEN 'shore_pick'::"ActiveSpirit" ELSE 'deep_tide'::"ActiveSpirit" END;

ALTER TABLE "support_events" ALTER COLUMN "activeSpirit" SET NOT NULL;

DROP TABLE IF EXISTS "mode_transitions";
ALTER TABLE "support_events" DROP COLUMN "surfaceMode";
ALTER TABLE "conversations" DROP COLUMN "mode";
DROP TYPE IF EXISTS "TransitionStatus";
DROP TYPE IF EXISTS "SurfaceMode";
ALTER TABLE "turns" DROP COLUMN "intent";

CREATE TABLE "memory_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "kind" "MemoryKind" NOT NULL,
  "content" TEXT NOT NULL,
  "structuredKey" TEXT NOT NULL,
  "structuredValue" TEXT,
  "contentHash" TEXT NOT NULL,
  "origin" "MemoryOrigin" NOT NULL,
  "sensitivity" "MemorySensitivity" NOT NULL,
  "importance" DOUBLE PRECISION NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "status" "MemoryStatus" NOT NULL DEFAULT 'active',
  "observedAt" TIMESTAMP(3) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "supersedesId" TEXT,
  "recallCount" INTEGER NOT NULL DEFAULT 0,
  "lastRecalledAt" TIMESTAMP(3),
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memory_evidence" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "messageId" TEXT,
  "speaker" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memory_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memory_revisions" (
  "id" TEXT NOT NULL,
  "memoryId" TEXT NOT NULL,
  "previousContent" TEXT NOT NULL,
  "previousStatus" "MemoryStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memory_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_items_userId_status_expiresAt_idx" ON "memory_items"("userId", "status", "expiresAt");
CREATE INDEX "memory_items_userId_kind_structuredKey_status_idx" ON "memory_items"("userId", "kind", "structuredKey", "status");
CREATE INDEX "memory_items_conversationId_observedAt_idx" ON "memory_items"("conversationId", "observedAt");
CREATE INDEX "memory_items_contentHash_idx" ON "memory_items"("contentHash");
CREATE UNIQUE INDEX "memory_items_one_active_structured_key" ON "memory_items"("userId", "kind", "structuredKey") WHERE "status" = 'active';
CREATE INDEX "memory_evidence_memoryId_idx" ON "memory_evidence"("memoryId");
CREATE INDEX "memory_evidence_messageId_idx" ON "memory_evidence"("messageId");
CREATE INDEX "memory_revisions_memoryId_createdAt_idx" ON "memory_revisions"("memoryId", "createdAt");

ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "memory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memory_evidence" ADD CONSTRAINT "memory_evidence_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_revisions" ADD CONSTRAINT "memory_revisions_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
