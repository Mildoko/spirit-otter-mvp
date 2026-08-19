ALTER TYPE "MemoryStatus" ADD VALUE IF NOT EXISTS 'disabled';
ALTER TYPE "MemoryStatus" ADD VALUE IF NOT EXISTS 'rejected';

CREATE TYPE "MemoryClaimState" AS ENUM ('asserted', 'hypothesis', 'confirmed');
CREATE TYPE "MemoryRelationType" AS ENUM ('involves', 'may_trigger', 'supports', 'contradicts', 'updates', 'related_to', 'part_of');
CREATE TYPE "MemoryRelationStatus" AS ENUM ('active', 'disabled', 'rejected', 'expired');

ALTER TABLE "memory_items"
  ADD COLUMN "claimState" "MemoryClaimState",
  ADD COLUMN "eventAt" TIMESTAMP(3),
  ADD COLUMN "validTo" TIMESTAMP(3),
  ADD COLUMN "reviewExpiresAt" TIMESTAMP(3);

UPDATE "memory_items"
SET "claimState" = CASE
  WHEN "origin" = 'user_explicit' THEN 'asserted'::"MemoryClaimState"
  ELSE 'hypothesis'::"MemoryClaimState"
END,
"schemaVersion" = 2;

ALTER TABLE "memory_items" ALTER COLUMN "claimState" SET NOT NULL;
ALTER TABLE "memory_items" ALTER COLUMN "claimState" SET DEFAULT 'asserted';
ALTER TABLE "memory_items" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

CREATE TABLE "memory_relations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceMemoryId" TEXT NOT NULL,
  "targetMemoryId" TEXT NOT NULL,
  "type" "MemoryRelationType" NOT NULL,
  "origin" "MemoryOrigin" NOT NULL,
  "claimState" "MemoryClaimState" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "status" "MemoryRelationStatus" NOT NULL DEFAULT 'active',
  "evidence" TEXT NOT NULL,
  "fingerprintHash" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "reviewExpiresAt" TIMESTAMP(3),
  "presentedAt" TIMESTAMP(3),
  "presentationCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memory_relations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memory_relations_userId_status_expiresAt_idx" ON "memory_relations"("userId", "status", "expiresAt");
CREATE INDEX "memory_relations_sourceMemoryId_status_idx" ON "memory_relations"("sourceMemoryId", "status");
CREATE INDEX "memory_relations_targetMemoryId_status_idx" ON "memory_relations"("targetMemoryId", "status");
CREATE INDEX "memory_relations_fingerprintHash_idx" ON "memory_relations"("fingerprintHash");
CREATE UNIQUE INDEX "memory_relations_one_active_fingerprint" ON "memory_relations"("userId", "fingerprintHash") WHERE "status" = 'active';

ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_sourceMemoryId_fkey" FOREIGN KEY ("sourceMemoryId") REFERENCES "memory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_targetMemoryId_fkey" FOREIGN KEY ("targetMemoryId") REFERENCES "memory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION enforce_memory_relation_user_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "memory_items" WHERE "id" = NEW."sourceMemoryId" AND "userId" = NEW."userId")
     OR NOT EXISTS (SELECT 1 FROM "memory_items" WHERE "id" = NEW."targetMemoryId" AND "userId" = NEW."userId") THEN
    RAISE EXCEPTION 'memory relation endpoints must belong to the same user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "memory_relations_user_scope_trigger"
BEFORE INSERT OR UPDATE ON "memory_relations"
FOR EACH ROW EXECUTE FUNCTION enforce_memory_relation_user_scope();
