import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { listStructuredOutputContracts } from "../modules/support/structured-output.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = loadEnv({ ...process.env, LLM_STRUCTURED_OUTPUT_MODE: "new" });
const gateway = new LlmGateway(env);
const capability = await gateway.probeStructuredOutput();
const report = {
  schemaVersion: "structured-output-capability-v1",
  provenance: resolveEvidenceProvenance(workspaceRoot),
  provider: env.LLM_PROVIDER,
  model: env.LLM_MODEL,
  transport: capability.transport,
  usageMetadata: capability.usageMetadata,
  syntheticOnly: true,
  status: capability.status,
  reason: capability.reason,
  schemaIds: listStructuredOutputContracts().map((contract) => contract.schemaId),
};
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "structured-output-capability.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`STRUCTURED_OUTPUT_CAPABILITY ${report.status}${report.reason ? ` reason=${report.reason}` : ""}\n`);
if (report.status === "invalid") process.exitCode = 1;
