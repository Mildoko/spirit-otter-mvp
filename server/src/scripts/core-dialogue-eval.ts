import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { POLICY_VERSION, PROMPT_VERSION } from "../config/constants.js";
import { CHARACTER_VERSION } from "../modules/character/cards.js";
import { RESPONSE_STYLE_VERSION } from "../modules/character/response-style.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { runCoreDialogueEval, type EvalLane, type MetricSummary } from "../evals/core-dialogue-eval.js";
import { renderCoreDialogueMarkdown } from "../evals/core-dialogue-report.js";
import type { MetricId } from "../evals/core-dialogue-schema.js";
import { EXPERIENCE_CONSTITUTION_VERSION } from "../product/experience-constitution.js";

const laneArg = process.argv.find((argument) => argument.startsWith("--lane="))?.split("=")[1] ?? "deterministic";
if (laneArg !== "deterministic" && laneArg !== "model") throw new Error(`未知 Eval 通道：${laneArg}`);
const lane: EvalLane = laneArg;
const baselineArg = process.argv.find((argument) => argument.startsWith("--baseline="))?.slice("--baseline=".length);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baseEnv = loadEnv(lane === "deterministic" ? { ...process.env, NODE_ENV: "test", LLM_API_KEY: "" } : process.env);
if (lane === "model" && !baseEnv.LLM_API_KEY) throw new Error("真实模型 Eval 需要配置 LLM_API_KEY");
const env = baseEnv;

let gitCommit = "unknown";
let gitDirty = true;
try {
  gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, encoding: "utf8" }).trim();
  gitDirty = execFileSync("git", ["status", "--porcelain"], { cwd: workspaceRoot, encoding: "utf8" }).trim().length > 0;
} catch {}

function loadBaselineRates(path: string | undefined): Partial<Record<MetricId, number>> {
  if (!path) return {};
  const absolute = resolve(workspaceRoot, path);
  if (!existsSync(absolute)) throw new Error(`基线文件不存在：${absolute}`);
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as { schemaVersion?: string; metrics?: MetricSummary[] };
  if (parsed.schemaVersion !== "core-dialogue-eval-v1" || !Array.isArray(parsed.metrics)) throw new Error("基线文件不是有效的 Core Dialogue Eval v1 报告");
  return Object.fromEntries(parsed.metrics.filter((metric) => metric.rate !== null).map((metric) => [metric.metricId, metric.rate!])) as Partial<Record<MetricId, number>>;
}

const report = await runCoreDialogueEval({
  orchestrator: new SupportOrchestrator(new LlmGateway(env), env), lane,
  run: {
    provider: env.LLM_PROVIDER, model: env.LLM_MODEL, experienceConstitutionVersion: EXPERIENCE_CONSTITUTION_VERSION,
    promptVersion: PROMPT_VERSION, policyVersion: POLICY_VERSION,
    characterVersion: CHARACTER_VERSION, responseStyleVersion: RESPONSE_STYLE_VERSION, gitCommit, gitDirty,
  },
  baselineRates: loadBaselineRates(baselineArg),
});

const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
const stem = `core-dialogue-eval-${lane}`;
writeFileSync(resolve(outputDirectory, `${stem}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(resolve(outputDirectory, `${stem}.md`), renderCoreDialogueMarkdown(report), "utf8");
process.stdout.write(`CORE_DIALOGUE_EVAL ${report.runStatus} hard_failures=${report.hardGateFailures.length} invalid=${report.invalidReasons.length}\n`);
if (report.runStatus !== "passed") process.exitCode = 1;
