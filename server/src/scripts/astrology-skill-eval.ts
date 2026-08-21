import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { POLICY_VERSION, PROMPT_VERSION } from "../config/constants.js";
import { runAstrologySkillEval, type AstrologyEvalLane } from "../evals/astrology-skill-eval.js";
import { renderAstrologySkillMarkdown } from "../evals/astrology-skill-report.js";
import { CHARACTER_VERSION } from "../modules/character/cards.js";
import { RESPONSE_STYLE_VERSION } from "../modules/character/response-style.js";
import { ASTROLOGY_KNOWLEDGE_VERSION } from "../modules/skills/astrology/knowledge.js";
import { ASTROLOGY_SKILL_VERSION } from "../modules/skills/astrology/skill.js";
import { SKILL_HARNESS_VERSION } from "../modules/skills/types.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { EXPERIENCE_CONSTITUTION_VERSION } from "../product/experience-constitution.js";

const laneArg = process.argv.find((argument) => argument.startsWith("--lane="))?.split("=")[1] ?? "deterministic";
if (laneArg !== "deterministic" && laneArg !== "model") throw new Error(`未知 Astrology Eval 通道：${laneArg}`);
const lane: AstrologyEvalLane = laneArg;
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const env = loadEnv({ ...process.env, ...(lane === "deterministic" ? { NODE_ENV: "test", LLM_API_KEY: "" } : {}), ASTROLOGY_SKILL_V1: "true" });
if (lane === "model" && !env.LLM_API_KEY) throw new Error("真实模型 Astrology Eval 需要配置 LLM_API_KEY");
const safetyEnv = loadEnv({ ...process.env, NODE_ENV: "test", LLM_API_KEY: "", ASTROLOGY_SKILL_V1: "true" });

let gitCommit = "unknown";
let gitDirty = true;
try {
  gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, encoding: "utf8" }).trim();
  gitDirty = execFileSync("git", ["status", "--porcelain"], { cwd: workspaceRoot, encoding: "utf8" }).trim().length > 0;
} catch {}

const report = await runAstrologySkillEval({
  orchestrator: new SupportOrchestrator(new LlmGateway(env), env),
  safetyOrchestrator: new SupportOrchestrator(new LlmGateway(safetyEnv), safetyEnv),
  lane,
  run: {
    gitCommit, gitDirty, provider: env.LLM_PROVIDER, model: env.LLM_MODEL,
    experienceConstitutionVersion: EXPERIENCE_CONSTITUTION_VERSION,
    promptVersion: PROMPT_VERSION, policyVersion: POLICY_VERSION,
    characterVersion: CHARACTER_VERSION, responseStyleVersion: RESPONSE_STYLE_VERSION,
    skillVersion: ASTROLOGY_SKILL_VERSION, knowledgeVersion: ASTROLOGY_KNOWLEDGE_VERSION,
    harnessVersion: SKILL_HARNESS_VERSION,
  },
});

const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
const stem = `astrology-skill-eval-${lane}`;
writeFileSync(resolve(outputDirectory, `${stem}.json`), JSON.stringify(report, null, 2), "utf8");
writeFileSync(resolve(outputDirectory, `${stem}.md`), renderAstrologySkillMarkdown(report), "utf8");
process.stdout.write(`ASTROLOGY_SKILL_EVAL ${report.runStatus} hard_failures=${report.hardGateFailures.length} invalid=${report.invalidReasons.length}\n`);
if (report.runStatus !== "passed") process.exitCode = 1;
