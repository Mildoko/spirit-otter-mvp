import type { RawSignals } from "@otter/shared";

type ScoreKey = "urgencyScore" | "helplessnessScore" | "overloadCueScore" | "taskPressureScore" | "supportSeekingScore";
interface Rule { code: string; phrases: string[]; scores: Partial<Record<ScoreKey, number>>; polarity?: number }

const rules: Rule[] = [
  { code: "NEGATIVE_DISTRESS", phrases: ["难受", "糟糕", "崩溃", "焦虑", "烦", "绝望", "撑不住"], scores: { helplessnessScore: 0.6 }, polarity: -0.7 },
  { code: "FATIGUE", phrases: ["很累", "累坏", "精疲力尽"], scores: { helplessnessScore: 0.45 }, polarity: -0.5 },
  { code: "URGENT_TIME", phrases: ["马上", "来不及", "紧急", "着急", "迫在眉睫"], scores: { urgencyScore: 0.75 } },
  { code: "OVERLOAD_ORDER", phrases: ["不知道先做哪个", "不知道从哪开始", "理不清"], scores: { overloadCueScore: 0.9, taskPressureScore: 0.55 } },
  { code: "OVERLOAD_COGNITIVE", phrases: ["脑子转不动", "脑子一团乱", "思绪很乱"], scores: { overloadCueScore: 0.9, helplessnessScore: 0.5 } },
  { code: "OVERLOAD_PILE", phrases: ["事情堆在一起", "任务全堆", "太多", "做不完", "堆着"], scores: { overloadCueScore: 0.85, taskPressureScore: 0.8 } },
  { code: "TASK_CONTEXT", phrases: ["工作", "项目", "任务", "截止", "作业", "待办", "汇报"], scores: { taskPressureScore: 0.7 } },
  { code: "SUPPORT_REQUEST", phrases: ["陪我", "听我", "想说", "聊聊", "帮帮我"], scores: { supportSeekingScore: 0.85 } },
  { code: "RECOVERY_CLARITY", phrases: ["理清楚一点", "清楚多了", "没那么乱了"], scores: { overloadCueScore: 0.15, helplessnessScore: 0.15 }, polarity: 0.35 },
];

const negations = ["并不", "并没有", "没有", "没", "不", "并非"];
const intensifiers = ["非常", "特别", "太", "完全", "极其", "真的"];

function matchRule(text: string, rule: Rule): { phrase: string; factor: number } | null {
  for (const phrase of rule.phrases) {
    const index = text.indexOf(phrase);
    if (index < 0) continue;
    const prefix = text.slice(Math.max(0, index - 5), index);
    if (negations.some((word) => prefix.endsWith(word))) continue;
    return { phrase, factor: intensifiers.some((word) => prefix.includes(word)) ? 1.15 : 1 };
  }
  return null;
}

export function extractFallbackSignals(text: string): RawSignals {
  const scores: Record<ScoreKey, number> = {
    urgencyScore: 0.2, helplessnessScore: 0.15, overloadCueScore: 0.2, taskPressureScore: 0.15, supportSeekingScore: 0.4,
  };
  let sentimentPolarity = 0;
  const evidenceSpans: string[] = [];
  const ruleCodes: string[] = [];
  for (const rule of rules) {
    const match = matchRule(text, rule);
    if (!match) continue;
    ruleCodes.push(rule.code);
    evidenceSpans.push(`[${rule.code}] ${match.phrase}`);
    for (const [key, value] of Object.entries(rule.scores) as Array<[ScoreKey, number]>) scores[key] = Math.max(scores[key], Math.min(1, value * match.factor));
    if (rule.polarity !== undefined) sentimentPolarity = Math.max(-1, Math.min(1, rule.polarity * match.factor));
  }
  return { sentimentPolarity, ...scores, evidenceSpans: evidenceSpans.slice(0, 5), confidence: ruleCodes.length ? 0.55 : 0.25, modelRiskHint: "low", ruleCodes };
}
