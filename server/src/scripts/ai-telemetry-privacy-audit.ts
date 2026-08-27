import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { auditAiTelemetryPrivacy } from "../observability/ai-telemetry-privacy-audit.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const report = auditAiTelemetryPrivacy(loadEnv());
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "ai-telemetry-privacy-audit.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`AI_TELEMETRY_PRIVACY_AUDIT ${report.status} readiness=${report.readiness}\n`);
if (report.status !== "passed") process.exitCode = 1;
