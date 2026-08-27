CREATE TYPE "AgentHandoffStatus" AS ENUM ('proposed', 'authorized', 'completed', 'rejected', 'expired', 'safety_interrupted');

CREATE TABLE "agent_handoffs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "status" "AgentHandoffStatus" NOT NULL DEFAULT 'proposed',
  "fromAgentId" TEXT NOT NULL,
  "toAgentId" TEXT NOT NULL,
  "initiatedBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "focus" TEXT NOT NULL,
  "publicItemId" TEXT,
  "actionId" TEXT,
  "followupId" TEXT,
  "authorization" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "proposalExpiresAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_handoffs_distinct_agents_check" CHECK ("fromAgentId" <> "toAgentId"),
  CONSTRAINT "agent_handoffs_from_agent_check" CHECK ("fromAgentId" IN ('zen_deer', 'spirit_otter', 'bird_courier')),
  CONSTRAINT "agent_handoffs_to_agent_check" CHECK ("toAgentId" IN ('zen_deer', 'spirit_otter', 'bird_courier')),
  CONSTRAINT "agent_handoffs_initiator_check" CHECK ("initiatedBy" IN ('user', 'agent')),
  CONSTRAINT "agent_handoffs_reason_check" CHECK ("reason" IN ('user_requested', 'capability_match', 'public_item_discussion')),
  CONSTRAINT "agent_handoffs_focus_check" CHECK ("focus" IN ('emotional_support', 'meaning_reflection', 'practical_planning', 'public_item_discussion')),
  CONSTRAINT "agent_handoffs_authorization_check" CHECK ("authorization" IS NULL OR "authorization" = 'explicit_user_confirm'),
  CONSTRAINT "agent_handoffs_proposal_window_check" CHECK ("proposalExpiresAt" > "createdAt" AND "proposalExpiresAt" <= "createdAt" + INTERVAL '15 minutes'),
  CONSTRAINT "agent_handoffs_retention_window_check" CHECK ("expiresAt" >= "proposalExpiresAt" AND "expiresAt" <= "createdAt" + INTERVAL '31 days'),
  CONSTRAINT "agent_handoffs_authorized_state_check" CHECK ("status" NOT IN ('authorized', 'completed') OR ("authorization" = 'explicit_user_confirm' AND "authorizedAt" IS NOT NULL)),
  CONSTRAINT "agent_handoffs_completed_state_check" CHECK ("status" <> 'completed' OR "completedAt" IS NOT NULL)
);

CREATE INDEX "agent_handoffs_userId_status_expiresAt_idx" ON "agent_handoffs"("userId", "status", "expiresAt");
CREATE INDEX "agent_handoffs_conversationId_status_createdAt_idx" ON "agent_handoffs"("conversationId", "status", "createdAt");
CREATE INDEX "agent_handoffs_status_proposalExpiresAt_idx" ON "agent_handoffs"("status", "proposalExpiresAt");
CREATE UNIQUE INDEX "agent_handoffs_one_open_per_conversation" ON "agent_handoffs"("conversationId") WHERE "status" IN ('proposed', 'authorized');

ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
