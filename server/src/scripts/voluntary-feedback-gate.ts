import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { evaluateVoluntaryFeedbackGate, renderVoluntaryFeedbackGateMarkdown, type ResearchSafetyReviewV1 } from "../research/voluntary-feedback-gate.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const value = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? process.env[`npm_config_${name.replaceAll("-", "_")}`];
const safetyPath = resolve(workspaceRoot, value("safety-review") ?? "test-results/research-safety-review.json");
const safetyReview = existsSync(safetyPath) ? JSON.parse(readFileSync(safetyPath, "utf8")) as ResearchSafetyReviewV1 : undefined;
const prisma = new PrismaClient();
try {
  const events = await prisma.behaviorEvent.findMany({
    select: { id: true, eventType: true, eventVersion: true, metadataJson: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const report = evaluateVoluntaryFeedbackGate({ events, ...(safetyReview ? { safetyReview } : {}) });
  const outputDirectory = resolve(workspaceRoot, "test-results");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "voluntary-feedback-gate.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(outputDirectory, "voluntary-feedback-gate.md"), renderVoluntaryFeedbackGateMarkdown(report), "utf8");
  process.stdout.write(`VOLUNTARY_FEEDBACK_GATE ${report.status} completed=${report.completedSegments}/50\n`);
  if (report.status !== "passed") process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
