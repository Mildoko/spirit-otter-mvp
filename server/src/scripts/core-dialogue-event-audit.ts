import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { auditCoreDialogueEvents, renderCoreDialogueEventAuditMarkdown } from "../events/core-dialogue-event-audit.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const prisma = new PrismaClient();
try {
  const events = await prisma.behaviorEvent.findMany({
    select: { id: true, eventKey: true, eventType: true, eventVersion: true, metadataJson: true, occurredAt: true, isReplay: true },
    orderBy: { occurredAt: "asc" },
  });
  const now = new Date();
  const report = auditCoreDialogueEvents(events, now, resolveEvidenceProvenance(workspaceRoot, now));
  const outputDirectory = resolve(workspaceRoot, "test-results");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "core-dialogue-event-audit.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(outputDirectory, "core-dialogue-event-audit.md"), renderCoreDialogueEventAuditMarkdown(report), "utf8");
  process.stdout.write(`CORE_DIALOGUE_EVENT_AUDIT ${report.status} audited=${report.auditedRows} invalid=${report.invalidEvents.length}\n`);
  if (report.status !== "passed") process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
