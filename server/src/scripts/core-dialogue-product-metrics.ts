import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { calculateCoreDialogueProductMetrics, renderCoreDialogueProductMetricsMarkdown } from "../metrics/core-dialogue-product-metrics.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const prisma = new PrismaClient();
try {
  const events = await prisma.behaviorEvent.findMany({
    select: { id: true, eventType: true, eventVersion: true, metadataJson: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const now = new Date();
  const report = calculateCoreDialogueProductMetrics(events, now, resolveEvidenceProvenance(workspaceRoot, now));
  const outputDirectory = resolve(workspaceRoot, "test-results");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "core-dialogue-product-metrics.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(outputDirectory, "core-dialogue-product-metrics.md"), renderCoreDialogueProductMetricsMarkdown(report), "utf8");
  process.stdout.write(`CORE_DIALOGUE_PRODUCT_METRICS ${report.status} events=${report.auditedEvents}\n`);
  if (report.status !== "valid") process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
