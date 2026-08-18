import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { EmotionLabelV1, RawSignals } from "@otter/shared";
import { loadEnv } from "../config/env.js";
import { extractFallbackSignals } from "../modules/support/fallback-signals.js";
import { resolveEmotionHypothesis } from "../modules/support/emotion-inference.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";
import { emotionLabelV1Schema } from "../modules/support/schemas.js";

const root = resolve(new URL("../../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const sampleRoot = resolve(root, "research", "emotion", "samples");
const levels = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const recordSchema = z.object({
  id: z.string().min(1), schemaVersion: z.literal("emotion-annotation-v1"), scenario: z.string().min(1),
  groupId: z.string().optional(), turnIndex: z.number().int().min(0).optional(),
  context: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }).strict()).max(12),
  userText: z.string().min(1),
  annotation: z.object({
    emotions: z.array(z.object({ label: emotionLabelV1Schema, intensityLevel: levels, confidenceLevel: levels, evidenceSpans: z.array(z.string().min(1)).min(1).max(5) }).strict()).max(2),
    valenceLevel: levels, arousalLevel: levels, controlLevel: levels, clarityLevel: levels,
    neutral: z.boolean(), unknown: z.boolean(), explicitSelfReport: z.boolean(), emotionSubject: z.enum(["user", "other", "mixed", "unknown"]),
  }).strict(),
  phenomena: z.array(z.string()), sourceType: z.enum(["human_authored", "synthetic_candidate", "consented_deidentified"]),
  split: z.enum(["dev", "validation", "test"]), annotationStatus: z.enum(["candidate", "single_reviewed", "double_reviewed", "adjudicated"]),
}).strict();
type RecordV1 = z.infer<typeof recordSchema>;

function readJsonl(name: string): RecordV1[] {
  return readFileSync(resolve(sampleRoot, name), "utf8").split(/\r?\n/u).filter(Boolean).map((line, index) => {
    const parsed = JSON.parse(line) as unknown;
    const result = recordSchema.safeParse(parsed);
    if (!result.success) throw new Error(`${name}:${index + 1} ${result.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ")}`);
    return result.data;
  });
}

const files = ["dev.jsonl", "validation.jsonl", "test.jsonl", "multi-turn.jsonl"];
const all = files.flatMap(readJsonl);
const ids = new Set<string>();
for (const item of all) {
  if (ids.has(item.id)) throw new Error(`重复样本 ID: ${item.id}`);
  ids.add(item.id);
  if (item.annotation.neutral && item.annotation.unknown) throw new Error(`${item.id}: neutral 与 unknown 不能同时为 true`);
  if ((item.annotation.neutral || item.annotation.unknown) && item.annotation.emotions.length > 0) throw new Error(`${item.id}: neutral/unknown 不能携带情绪标签`);
  for (const emotion of item.annotation.emotions) for (const evidence of emotion.evidenceSpans) if (!item.userText.includes(evidence)) throw new Error(`${item.id}: 证据不是当前原文片段: ${evidence}`);
}

const splitCount = (split: RecordV1["split"]) => all.filter((item) => item.split === split).length;
if (all.length !== 300 || splitCount("dev") !== 180 || splitCount("validation") !== 60 || splitCount("test") !== 60) {
  throw new Error(`候选集数量错误：all=${all.length}, dev=${splitCount("dev")}, validation=${splitCount("validation")}, test=${splitCount("test")}`);
}

const validateOnly = process.argv.includes("--validate-only");
const useModel = process.argv.includes("--model");
const evaluated = all.filter((item) => item.split === "test");
const env = loadEnv();
if (useModel && !env.LLM_API_KEY) throw new Error("未配置 LLM_API_KEY，不能执行真实模型情绪评测");
const gateway = new LlmGateway({ ...env, EMOTION_INFERENCE_V2: true });

type Prediction = { sample: RecordV1; signals: RawSignals; labels: EmotionLabelV1[]; status: string; valence: number; arousal: number; control: number; confidence: number; source: "cloud_model" | "local_fallback"; failureReason?: string };
async function predict(sample: RecordV1): Promise<Prediction> {
  const model = useModel ? await gateway.analyze(sample.userText, true, sample.context.map((item) => `${item.role}: ${item.text}`)) : null;
  const failureReason = useModel && !model ? [gateway.lastFailureReason ?? "unknown", gateway.lastFailureDetail].filter(Boolean).join(":") : undefined;
  const signals = model?.signals ?? extractFallbackSignals(sample.userText);
  const resolved = resolveEmotionHypothesis({ text: sample.userText, signals, enabled: true });
  return {
    sample, signals, labels: resolved.hypothesis.labels.map((item) => item.label), status: resolved.hypothesis.status,
    valence: resolved.hypothesis.valence, arousal: resolved.hypothesis.arousal, control: resolved.hypothesis.control,
    confidence: resolved.hypothesis.confidence, source: model ? "cloud_model" : "local_fallback", ...(failureReason ? { failureReason } : {}),
  };
}

const labels = emotionLabelV1Schema.options;
const levelToValence = (value: number) => (value - 3) / 2;
const levelToUnit = (value: number) => (value - 1) / 4;
const safeRate = (top: number, bottom: number) => bottom === 0 ? 0 : top / bottom;
const fmt = (value: number) => Number.isFinite(value) ? value.toFixed(3) : "n/a";

let report: string;
if (validateOnly) {
  report = `# 情绪候选集校验\n\n- 状态：候选数据，不是人工金标准。\n- 总话语：${all.length}\n- dev/validation/test：${splitCount("dev")}/${splitCount("validation")}/${splitCount("test")}\n- 单轮：${all.filter((item) => !item.groupId?.startsWith("MT-")).length}\n- 多轮组：${new Set(all.filter((item) => item.groupId?.startsWith("MT-")).map((item) => item.groupId)).size}\n- Schema、ID、数量和逐字证据检查：通过\n- 双人标注与仲裁：未完成\n`;
} else {
  const predictions: Prediction[] = [];
  for (let index = 0; index < evaluated.length; index += 4) predictions.push(...await Promise.all(evaluated.slice(index, index + 4).map(predict)));
  const cloudCount = predictions.filter((item) => item.source === "cloud_model").length;
  const fallbackCount = predictions.length - cloudCount;
  const actualSource = cloudCount === predictions.length ? "cloud_model" : cloudCount === 0 ? "local_fallback" : "mixed";
  const failureReasonCounts = new Map<string, number>();
  for (const prediction of predictions) if (prediction.failureReason) failureReasonCounts.set(prediction.failureReason, (failureReasonCounts.get(prediction.failureReason) ?? 0) + 1);
  const failureReasons = [...failureReasonCounts].map(([reason, count]) => `${reason}=${count}`).join("、");
  const f1s = labels.map((label) => {
    let tp = 0; let fp = 0; let fn = 0;
    for (const item of predictions) {
      const expected = item.sample.annotation.emotions.some((emotion) => emotion.label === label);
      const predicted = item.labels.includes(label);
      if (expected && predicted) tp += 1; else if (!expected && predicted) fp += 1; else if (expected) fn += 1;
    }
    return safeRate(2 * tp, 2 * tp + fp + fn);
  });
  const macroF1 = f1s.reduce((sum, value) => sum + value, 0) / f1s.length;
  const neutralRecall = safeRate(predictions.filter((item) => item.sample.annotation.neutral && item.status === "neutral").length, predictions.filter((item) => item.sample.annotation.neutral).length);
  const unknownRecall = safeRate(predictions.filter((item) => item.sample.annotation.unknown && item.status === "unknown").length, predictions.filter((item) => item.sample.annotation.unknown).length);
  const statusBalanced = (neutralRecall + unknownRecall) / 2;
  const valenceMae = predictions.reduce((sum, item) => sum + Math.abs(item.valence - levelToValence(item.sample.annotation.valenceLevel)), 0) / predictions.length;
  const arousalMae = predictions.reduce((sum, item) => sum + Math.abs(item.arousal - levelToUnit(item.sample.annotation.arousalLevel)), 0) / predictions.length;
  const controlMae = predictions.reduce((sum, item) => sum + Math.abs(item.control - levelToUnit(item.sample.annotation.controlLevel)), 0) / predictions.length;
  const explicit = predictions.filter((item) => item.sample.annotation.explicitSelfReport);
  const explicitPass = safeRate(explicit.filter((item) => item.sample.annotation.emotions.every((emotion) => item.labels.includes(emotion.label))).length, explicit.length);
  const highConfidence = predictions.filter((item) => item.confidence >= 0.8);
  const highConfidenceCorrect = highConfidence.filter((item) => item.labels.every((label) => item.sample.annotation.emotions.some((emotion) => emotion.label === label)) && item.labels.length > 0).length;
  const highConfidencePrecision = safeRate(highConfidenceCorrect, highConfidence.length);
  const failures = predictions.filter((item) => {
    const expected = item.sample.annotation.emotions.map((emotion) => emotion.label);
    return expected.some((label) => !item.labels.includes(label)) || item.labels.some((label) => !expected.includes(label)) || (item.sample.annotation.unknown && item.status !== "unknown") || (item.sample.annotation.neutral && item.status !== "neutral");
  });
  report = `# 情绪识别候选集报告（${useModel ? "DeepSeek 请求" : "fallback"}）\n\n> 当前样本均为 candidate，以下指标只能用于工程调试，不能作为发布门禁通过证明。\n\n- 样本：${predictions.length} 条 test 候选；实际来源：${actualSource}（模型 ${cloudCount} / fallback ${fallbackCount}）\n- 模型报告有效性：${useModel && fallbackCount > 0 ? "不通过；存在 fallback，不能冒充真实模型成绩" : useModel ? "调用完整，但仍待人工金标准" : "不适用"}${failureReasons ? `；失败原因：${failureReasons}` : ""}\n- Top-2 Macro-F1：${fmt(macroF1)}（目标 ≥0.700）\n- neutral/unknown 平衡召回：${fmt(statusBalanced)}（目标 ≥0.850）\n- 高置信度精确率：${fmt(highConfidencePrecision)}（目标 ≥0.900）\n- V/A/Control MAE：${fmt(valenceMae)} / ${fmt(arousalMae)} / ${fmt(controlMae)}（目标各 ≤0.200）\n- 明确自报命中率：${fmt(explicitPass)}（目标 1.000）\n- 失败桶：${failures.length}\n- 双人标注与盲评：未完成\n\n| ID | 现象 | 期望 | 预测 | 状态 | 置信度 |\n| --- | --- | --- | --- | --- | ---: |\n${failures.slice(0, 40).map((item) => `| ${item.sample.id} | ${item.sample.phenomena.join("、") || "普通"} | ${item.sample.annotation.emotions.map((emotion) => emotion.label).join("+") || (item.sample.annotation.unknown ? "unknown" : "neutral")} | ${item.labels.join("+") || item.status} | ${item.status} | ${fmt(item.confidence)} |`).join("\n")}\n`;

  const buckets = new Map<string, { total: number; failed: number }>();
  for (const prediction of predictions) {
    for (const bucket of prediction.sample.phenomena.length ? prediction.sample.phenomena : ["普通"]) {
      const current = buckets.get(bucket) ?? { total: 0, failed: 0 };
      current.total += 1;
      if (failures.includes(prediction)) current.failed += 1;
      buckets.set(bucket, current);
    }
  }
  mkdirSync(resolve(root, "test-results"), { recursive: true });
  writeFileSync(resolve(root, "test-results", `emotion-difficulty-buckets-${useModel ? "model" : "fallback"}.md`), `# 情绪困难现象分桶（${useModel ? "模型" : "fallback"}）\n\n> 候选数据，仅用于定位失败。\n\n| 分桶 | 样本 | 失败 | 失败率 |\n| --- | ---: | ---: | ---: |\n${[...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, value]) => `| ${bucket} | ${value.total} | ${value.failed} | ${fmt(safeRate(value.failed, value.total))} |`).join("\n")}\n`, "utf8");

  if (useModel) {
    const fallbackPredictions = evaluated.map((sample) => {
      const fallbackSignals = extractFallbackSignals(sample.userText);
      const resolved = resolveEmotionHypothesis({ text: sample.userText, signals: fallbackSignals, enabled: true });
      return { sample, labels: resolved.hypothesis.labels.map((item) => item.label), status: resolved.hypothesis.status };
    });
    const exact = (item: { sample: RecordV1; labels: EmotionLabelV1[]; status: string }) => {
      const expected = item.sample.annotation.emotions.map((emotion) => emotion.label).sort();
      return expected.join("|") === [...item.labels].sort().join("|")
        && (!item.sample.annotation.unknown || item.status === "unknown")
        && (!item.sample.annotation.neutral || item.status === "neutral");
    };
    const modelExact = predictions.filter(exact).length;
    const fallbackExact = fallbackPredictions.filter(exact).length;
    writeFileSync(resolve(root, "test-results", "emotion-model-vs-fallback.md"), `# DeepSeek 与 fallback 情绪对照\n\n> 对照使用未完成人工双审的候选测试集，不能作为发布声明。\n\n| 项目 | DeepSeek | fallback |\n| --- | ---: | ---: |\n| 实际完成 | ${cloudCount} | ${predictions.length} |\n| 严格标签/状态全匹配 | ${modelExact} | ${fallbackExact} |\n| 严格匹配率 | ${fmt(safeRate(modelExact, predictions.length))} | ${fmt(safeRate(fallbackExact, predictions.length))} |\n\n模型 fallback 次数：${fallbackCount}。存在任何 fallback 时，本次模型报告无效。\n`, "utf8");
  }
}

mkdirSync(resolve(root, "test-results"), { recursive: true });
const suffix = validateOnly ? "validation" : useModel ? "model" : "fallback";
const reportPath = resolve(root, "test-results", `emotion-evaluation-${suffix}.md`);
writeFileSync(reportPath, report, "utf8");
console.log(report);
console.log(`Report: ${reportPath}`);
if (useModel && !validateOnly && report.includes("模型报告有效性：不通过")) process.exitCode = 1;
