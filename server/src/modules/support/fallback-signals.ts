import type { RawSignals } from "@otter/shared";

function contains(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

export function extractFallbackSignals(text: string): RawSignals {
  const negative = contains(text, ["难受", "糟糕", "崩溃", "焦虑", "烦", "累", "绝望"]);
  const urgent = contains(text, ["马上", "现在", "来不及", "紧急"]);
  const overload = contains(text, ["太多", "乱", "不知道先做", "做不完", "堆着"]);
  const task = contains(text, ["工作", "项目", "任务", "截止", "作业", "待办"]);
  const support = contains(text, ["陪我", "听我", "想说", "聊聊", "帮帮我"]);
  return {
    sentimentPolarity: negative ? -0.65 : 0,
    urgencyScore: urgent ? 0.7 : 0.2,
    helplessnessScore: negative ? 0.55 : 0.15,
    overloadCueScore: overload ? 0.8 : 0.2,
    taskPressureScore: task ? 0.75 : 0.15,
    supportSeekingScore: support ? 0.8 : 0.4,
    evidenceSpans: [],
    confidence: 0.35,
    modelRiskHint: "low",
  };
}
