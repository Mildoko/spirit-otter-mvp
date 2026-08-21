import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../config/env.js";
import { astrologySkillSamples } from "../evals/datasets/astrology-skill-single-turn.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../modules/support/orchestrator.js";
import { DEFAULT_GUIDANCE_STATE } from "../modules/support/guidance-state.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baselineEnv = loadEnv({ ...process.env, ASTROLOGY_SKILL_V1: "false" });
const candidateEnv = loadEnv({ ...process.env, ASTROLOGY_SKILL_V1: "true" });
if (!baselineEnv.LLM_API_KEY) throw new Error("星座盲评需要配置 LLM_API_KEY");
const baseline = new SupportOrchestrator(new LlmGateway(baselineEnv), baselineEnv);
const candidate = new SupportOrchestrator(new LlmGateway(candidateEnv), candidateEnv);
const cases = astrologySkillSamples.filter((sample) => sample.expected.status === "active" && sample.expected.riskLevel === "low").slice(0, 24);
if (cases.length !== 24) throw new Error(`星座盲评必须有 24 条可用样本，当前为 ${cases.length}`);

const entries: Array<{ reviewId: string; input: string; responseA: string; responseB: string; dimensions: string[] }> = [];
const answerKey: Array<{ reviewId: string; baseline: "A" | "B"; candidate: "A" | "B"; baselineSource: string; candidateSource: string }> = [];
for (const [index, sample] of cases.entries()) {
  const request = {
    text: sample.input, currentSpirit: "deep_tide" as const, spiritTurnCount: 0, companionLockTurns: 0,
    recentContext: [], previousRawStates: [], memories: [], guidanceState: DEFAULT_GUIDANCE_STATE,
  };
  const [before, after] = await Promise.all([baseline.run(request), candidate.run(request)]);
  if (after.responseSource !== "cloud_model") {
    throw new Error(`${sample.sampleId} 候选版本未获得真实模型输出：candidate=${after.responseSource}`);
  }
  const candidateIsA = index % 2 === 1;
  const reviewId = `AST-BR-${String(index + 1).padStart(3, "0")}`;
  entries.push({
    reviewId,
    input: sample.input,
    responseA: candidateIsA ? after.reply : before.reply,
    responseB: candidateIsA ? before.reply : after.reply,
    dimensions: ["自然度", "趣味性", "文化熟悉度", "角色连续性", "直接回答能力", "免责声明负担", "是否过度心理咨询化"],
  });
  answerKey.push({ reviewId, baseline: candidateIsA ? "B" : "A", candidate: candidateIsA ? "A" : "B", baselineSource: before.responseSource, candidateSource: after.responseSource });
}

const markdown = [
  "# Astrology Skill v1 人工盲评包",
  "",
  "> 先独立评审，不查看 answer key 或 Eval 分数。每项选择 A 更好 / 无明显差异 / B 更好，并记录红旗证据。",
  "",
  ...entries.flatMap((entry) => [
    `## ${entry.reviewId}`,
    "",
    `用户：${entry.input}`,
    "",
    `A：${entry.responseA}`,
    "",
    `B：${entry.responseB}`,
    "",
    `维度：${entry.dimensions.join("、")}`,
    "",
    "评审结论：",
    "",
  ]),
].join("\n");
const output = resolve(workspaceRoot, "test-results");
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "astrology-skill-blind-review.json"), JSON.stringify({ schemaVersion: "astrology-skill-blind-review-v1", entries }, null, 2), "utf8");
writeFileSync(resolve(output, "astrology-skill-blind-review.md"), markdown, "utf8");
writeFileSync(resolve(output, "astrology-skill-blind-review-answer-key.json"), JSON.stringify({ schemaVersion: "astrology-skill-blind-review-v1", answerKey }, null, 2), "utf8");
process.stdout.write(`ASTROLOGY_SKILL_BLIND_REVIEW generated cases=${entries.length}\n`);
