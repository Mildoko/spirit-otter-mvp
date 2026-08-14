-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SurfaceMode" AS ENUM ('companion', 'organize');

-- CreateEnum
CREATE TYPE "TurnStatus" AS ENUM ('reserved', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('draft', 'confirmed', 'completed', 'deferred', 'deleted');

-- CreateEnum
CREATE TYPE "FollowupStatus" AS ENUM ('pending', 'completed', 'deferred', 'closed', 'deleted');

-- CreateEnum
CREATE TYPE "TransitionStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_users" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "adultConfirmedAt" TIMESTAMP(3) NOT NULL,
    "aiDisclosureAcceptedAt" TIMESTAMP(3) NOT NULL,
    "cloudProcessingAcceptedAt" TIMESTAMP(3) NOT NULL,
    "dataConsentAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anonymous_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "SurfaceMode" NOT NULL DEFAULT 'companion',
    "processingTurnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turns" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TurnStatus" NOT NULL DEFAULT 'reserved',
    "intent" TEXT NOT NULL,
    "resultJson" JSONB,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_snapshots" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "valence" DOUBLE PRECISION NOT NULL,
    "arousal" DOUBLE PRECISION NOT NULL,
    "stressLoad" DOUBLE PRECISION NOT NULL,
    "cognitiveOverload" DOUBLE PRECISION NOT NULL,
    "supportNeed" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_events" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "surfaceMode" "SurfaceMode" NOT NULL,
    "supportMode" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "primaryStrategy" TEXT NOT NULL,
    "planJson" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'draft',
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followup_tasks" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowupStatus" NOT NULL DEFAULT 'pending',
    "shownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followup_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mode_transitions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "targetMode" "SurfaceMode" NOT NULL,
    "status" "TransitionStatus" NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mode_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_events" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "ruleCodesJson" JSONB NOT NULL,
    "disposition" TEXT NOT NULL,
    "researcherHelpRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadataJson" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_codeHash_key" ON "invite_codes"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_usedById_key" ON "invite_codes"("usedById");

-- CreateIndex
CREATE INDEX "invite_codes_expiresAt_usedAt_idx" ON "invite_codes"("expiresAt", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_users_researchId_key" ON "anonymous_users"("researchId");

-- CreateIndex
CREATE INDEX "anonymous_users_expiresAt_idx" ON "anonymous_users"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_expiresAt_idx" ON "sessions"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_processingTurnId_key" ON "conversations"("processingTurnId");

-- CreateIndex
CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "turns_conversationId_status_idx" ON "turns"("conversationId", "status");

-- CreateIndex
CREATE INDEX "turns_expiresAt_idx" ON "turns"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "turns_conversationId_idempotencyKey_key" ON "turns"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_expiresAt_idx" ON "messages"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "state_snapshots_turnId_key" ON "state_snapshots"("turnId");

-- CreateIndex
CREATE INDEX "state_snapshots_conversationId_validUntil_idx" ON "state_snapshots"("conversationId", "validUntil");

-- CreateIndex
CREATE INDEX "state_snapshots_expiresAt_idx" ON "state_snapshots"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_events_turnId_key" ON "support_events"("turnId");

-- CreateIndex
CREATE INDEX "support_events_conversationId_createdAt_idx" ON "support_events"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_events_expiresAt_idx" ON "support_events"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "action_items_turnId_key" ON "action_items"("turnId");

-- CreateIndex
CREATE INDEX "action_items_conversationId_status_idx" ON "action_items"("conversationId", "status");

-- CreateIndex
CREATE INDEX "action_items_expiresAt_idx" ON "action_items"("expiresAt");

-- CreateIndex
CREATE INDEX "followup_tasks_conversationId_status_dueAt_idx" ON "followup_tasks"("conversationId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "followup_tasks_expiresAt_idx" ON "followup_tasks"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mode_transitions_turnId_key" ON "mode_transitions"("turnId");

-- CreateIndex
CREATE INDEX "mode_transitions_conversationId_status_idx" ON "mode_transitions"("conversationId", "status");

-- CreateIndex
CREATE INDEX "mode_transitions_expiresAt_idx" ON "mode_transitions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "safety_events_turnId_key" ON "safety_events"("turnId");

-- CreateIndex
CREATE INDEX "safety_events_conversationId_createdAt_idx" ON "safety_events"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "safety_events_expiresAt_idx" ON "safety_events"("expiresAt");

-- CreateIndex
CREATE INDEX "behavior_events_userId_createdAt_idx" ON "behavior_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "behavior_events_eventType_createdAt_idx" ON "behavior_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "behavior_events_expiresAt_idx" ON "behavior_events"("expiresAt");

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "anonymous_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turns" ADD CONSTRAINT "turns_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_snapshots" ADD CONSTRAINT "state_snapshots_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_snapshots" ADD CONSTRAINT "state_snapshots_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_events" ADD CONSTRAINT "support_events_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_tasks" ADD CONSTRAINT "followup_tasks_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_tasks" ADD CONSTRAINT "followup_tasks_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_transitions" ADD CONSTRAINT "mode_transitions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mode_transitions" ADD CONSTRAINT "mode_transitions_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_events" ADD CONSTRAINT "behavior_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
