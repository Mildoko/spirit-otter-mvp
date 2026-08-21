import type { EmotionHypothesisV1, EmotionLabelV1, EmotionState } from "@otter/shared";
import { emotionDisplayNames } from "../support/emotion-inference.js";

export interface EmotionExpressionBrief {
  status: EmotionHypothesisV1["status"];
  assertionMode: "fact_only" | "tentative" | "user_word";
  primaryLabels: EmotionLabelV1[];
  instructions: string[];
  avoid: string[];
  reasonCodes: string[];
}

const instructionsByLabel: Partial<Record<EmotionLabelV1, string>> = {
  sadness: "先回应具体的失去或难过，不急着解决，也不把日常不快夸大成沉重危机。",
  loneliness: "增加温度并回应缺少连接的部分，不暗示只有 AI 能陪伴。",
  anger: "先承认受阻、不公平或边界被碰到，不催用户冷静、原谅或先反思自己。",
  anxiety: "降低句子复杂度，增加当下确定性，最多保留一个真正必要的问题。",
  frustration: "回应努力受阻或反复无效的具体目标，不把挫败解释成能力不足。",
  disappointment: "回应期待落空的具体部分，不用积极重构盖过去。",
  shame: "把一次处境与整体自我分开，禁止使用‘你就是’式人格断言。",
  guilt: "区分具体行为和整体自我，不做道德裁判，也不轻率替用户免责。",
  disgust: "承认排斥或反感的边界，不要求用户合理化这种感受。",
  joy: "允许积极感受成立，不强行追问背后的困难。",
  relief: "允许松下来的变化成立，不立刻塞入下一项任务。",
  hope: "回应仍然存在的可能性，但不做保证。",
  interest: "顺着具体好奇点交流，不把兴趣改写成目标管理。",
  gratitude: "自然回应感谢，不索取关系承诺或强化依赖。",
  surprise: "先确认出乎预期的事实，再判断它偏正面还是偏负面。",
};

export function resolveEmotionExpressionBrief(hypothesis: EmotionHypothesisV1, state: EmotionState): EmotionExpressionBrief {
  const primaryLabels = hypothesis.subject === "other" ? [] : hypothesis.labels.map((item) => item.label).slice(0, 2);
  const instructions: string[] = [];
  const avoid = ["心理诊断", "人格结论", "把推测说成事实"];
  const reasonCodes: string[] = [];
  let assertionMode: EmotionExpressionBrief["assertionMode"] = "tentative";

  if (hypothesis.subject === "other") {
    assertionMode = "fact_only";
    instructions.push("现有情绪证据指向对话中的他人，不要把它说成用户本人的情绪；只回应这件事怎样影响了用户。 ");
    reasonCodes.push("EMOTION_OTHER_SUBJECT_FACT_ONLY");
  } else if (hypothesis.status === "unknown") {
    assertionMode = "fact_only";
    instructions.push("信息不足，只回应用户说出的事实、负担或矛盾；不要确定命名情绪。", "需要提及时只用‘可能、听着像’，并允许用户不同意。");
    reasonCodes.push("EMOTION_UNKNOWN_FACT_ONLY");
  } else if (hypothesis.status === "neutral") {
    assertionMode = "fact_only";
    instructions.push("暂未读到明显情绪，不要把平静、中性或没表达情绪说成没有感受。");
    reasonCodes.push("EMOTION_NEUTRAL_NO_ASSUMPTION");
  } else {
    assertionMode = hypothesis.status === "user_corrected" ? "user_word" : "tentative";
    for (const label of primaryLabels) {
      const instruction = instructionsByLabel[label];
      if (instruction) instructions.push(`${emotionDisplayNames[label]}：${instruction}`);
      reasonCodes.push(`EMOTION_${label.toUpperCase()}`);
    }
  }

  if ((state.control ?? 0.5) <= 0.3) {
    instructions.push("控制感较低：减少建议和追问，只给可拒绝的低压选择。");
    reasonCodes.push("LOW_CONTROL_RESTRAINT");
  }
  if (hypothesis.status === "user_corrected") {
    instructions.push("采用用户刚刚纠正的说法，但不要在每轮机械复述标签。");
    reasonCodes.push("USER_CORRECTION_PRIORITY");
  }

  return { status: hypothesis.status, assertionMode, primaryLabels, instructions, avoid, reasonCodes };
}
