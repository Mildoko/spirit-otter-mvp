import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/202608270001_p2_agent_handoff/migration.sql"), "utf8");

describe("P2 agent handoff migration contract", () => {
  it("stores only explicit structured columns without a free JSON or content field", () => {
    const table = migration.slice(migration.indexOf('CREATE TABLE "agent_handoffs"'), migration.indexOf('CREATE INDEX "agent_handoffs_userId'));
    expect(table).not.toMatch(/JSONB|"content"|"summary"|"userText"|"messages"/u);
    expect(table).toContain('"focus" TEXT NOT NULL');
    expect(table).toContain('"proposalExpiresAt" TIMESTAMP(3) NOT NULL');
  });

  it("enforces authorization, agent identity, proposal window and one open handoff", () => {
    expect(migration).toContain("agent_handoffs_distinct_agents_check");
    expect(migration).toContain("agent_handoffs_authorization_check");
    expect(migration).toContain("agent_handoffs_proposal_window_check");
    expect(migration).toContain("agent_handoffs_one_open_per_conversation");
  });

  it("cascades both account and conversation deletion", () => {
    expect(migration).toMatch(/agent_handoffs_userId_fkey[\s\S]*ON DELETE CASCADE/u);
    expect(migration).toMatch(/agent_handoffs_conversationId_fkey[\s\S]*ON DELETE CASCADE/u);
  });
});
