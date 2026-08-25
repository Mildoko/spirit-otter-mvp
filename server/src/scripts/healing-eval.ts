import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { runHealingEval } from "../evals/healing-eval.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../modules/support/orchestrator.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = loadEnv({ ...process.env, NODE_ENV: "test", LLM_API_KEY: "", OTTER_RUNTIME_MODE: "demo" });
const report = await runHealingEval(new SupportOrchestrator(new LlmGateway(env), env));
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "healing-eval-v1.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`HEALING_EVAL ${report.runStatus} single=${report.coverage.singleTurn} multi=${report.coverage.multiTurn} rupture=${report.coverage.ruptureRepair} material=${report.coverage.materialCrisis} manual=${report.manualExperienceReview}\n`);
if (report.runStatus !== "passed") process.exitCode = 1;
