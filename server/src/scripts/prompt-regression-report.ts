import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { buildPromptRegressionReport } from "../prompt-regression/report.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string): unknown => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
const report = buildPromptRegressionReport({
  provenance: resolveEvidenceProvenance(workspaceRoot),
  model: loadEnv().LLM_MODEL,
  offlineRaw: read(resolve(workspaceRoot, "test-results/promptfoo-offline.json")),
  modelRaw: read(resolve(workspaceRoot, "test-results/promptfoo-model.json")),
});
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "prompt-regression.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`PROMPT_REGRESSION ${report.status} offline=${report.offline.status} model=${report.realModel.status}\n`);
if (report.status === "failed") process.exitCode = 1;
