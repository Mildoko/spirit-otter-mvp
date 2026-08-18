import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EmotionHypothesisV1, EmotionLabelV1, EmotionState, ResponsePlan } from "@otter/shared";
import { resolveEmotionExpressionBrief } from "../modules/character/emotion-expression.js";
import { validateGeneratedReply } from "../modules/character/reply-validator.js";
import { resolveResponseStyle } from "../modules/character/response-style.js";
import { emotionDisplayNames } from "../modules/support/emotion-inference.js";
import { emotionLabelV1Schema } from "../modules/support/schemas.js";

const root = resolve(new URL("../../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const state: EmotionState = {
  valence: -0.3, arousal: 0.4, stressLoad: 0.4, cognitiveOverload: 0.3, supportNeed: 0.5,
  control: 0.5, emotionStatus: "inferred", emotionLabels: [], emotionSubject: "user", emotionSchemaVersion: 1,
  confidence: 0.8, evidenceSpans: ["证据"], validUntil: new Date(Date.now() + 60_000).toISOString(),
};
const plan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0,
  allowedContent: ["具体承接"], forbiddenContent: ["诊断", "直接行动"],
};
const style = resolveResponseStyle({ plan, state, recentContext: [], userText: "这件事让我很难受", riskLevel: "low" });
const hypothesis = (label: EmotionLabelV1): EmotionHypothesisV1 => ({
  schemaVersion: 1, status: "inferred", subject: "user", valence: -0.3, arousal: 0.4, control: 0.5,
  labels: [{ label, intensity: 0.7, confidence: 0.8, evidenceSpans: [emotionDisplayNames[label]] }], confidence: 0.8,
});

const coverage = emotionLabelV1Schema.options.map((label) => ({ label, brief: resolveEmotionExpressionBrief(hypothesis(label), state) }));
const gates: Array<[string, string, EmotionHypothesisV1]> = [
  ["UNSUPPORTED_EMOTION_ASSERTION", "你现在很愤怒，这就是你的真实情绪。", { ...hypothesis("anger"), status: "unknown", labels: [], confidence: 0.2 }],
  ["CONTRADICTS_USER_CORRECTION", "你其实很生气，这就是愤怒。", { ...hypothesis("disappointment"), status: "user_corrected", confidence: 1 }],
  ["UNKNOWN_TREATED_AS_NEUTRAL", "你其实很平静，没有什么情绪。", { ...hypothesis("anger"), status: "unknown", labels: [], confidence: 0.2 }],
  ["DIAGNOSTIC_EMOTION_CLAIM", "这证明你有人格问题。", hypothesis("sadness")],
  ["EMOTION_LABEL_WITHOUT_EVIDENCE", "你现在很生气，这就是愤怒。", { ...hypothesis("anger"), labels: [{ label: "anger" as const, intensity: 0.7, confidence: 0.9, evidenceSpans: [] }] }],
];
const results = gates.map(([code, reply, emotionHypothesis]) => {
  const result = validateGeneratedReply({ reply, actionDraft: null, plan, style, emotionHypothesis, userText: "说不上来", recentContext: [] });
  return { code, passed: result.violations.some((item) => item.code === code) };
});
const passed = coverage.every((item) => item.brief.instructions.length > 0) && results.every((item) => item.passed);
const report = `# 情绪承接与表达自动报告\n\n- 15 类策略覆盖：${coverage.filter((item) => item.brief.instructions.length > 0).length}/15\n- 五项情绪硬校验：${results.filter((item) => item.passed).length}/5\n- 自动门禁：${passed ? "通过" : "不通过"}\n- 人工盲评：未完成；请使用 research/emotion/BLIND_REVIEW_TEMPLATE.md。\n\n| 标签 | 中文 | 策略原因码 |\n| --- | --- | --- |\n${coverage.map((item) => `| ${item.label} | ${emotionDisplayNames[item.label]} | ${item.brief.reasonCodes.join("、")} |`).join("\n")}\n`;
mkdirSync(resolve(root, "test-results"), { recursive: true });
const reportPath = resolve(root, "test-results", "emotion-expression-evaluation.md");
writeFileSync(reportPath, report, "utf8");
console.log(report);
console.log(`Report: ${reportPath}`);
if (!passed) process.exitCode = 1;
