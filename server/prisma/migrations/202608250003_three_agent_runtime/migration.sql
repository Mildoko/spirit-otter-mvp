ALTER TABLE "conversations"
ADD COLUMN "activeAgentId" TEXT NOT NULL DEFAULT 'zen_deer';

ALTER TABLE "messages"
ADD COLUMN "agentId" TEXT;

UPDATE "messages"
SET "agentId" = 'zen_deer'
WHERE "role" = 'assistant' AND "agentId" IS NULL;
