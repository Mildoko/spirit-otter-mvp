import type { PublicEmotionInterpretation, SceneState } from "@otter/shared";

export type TataExpressionV1 = "welcome" | "warm" | "concerned" | "attentive" | "steady" | "curious" | "uncertain" | "protective" | "neutral";

export interface TataExpressionCueV1 {
  expression: TataExpressionV1;
  symbol: string;
  label: string;
}

const cues: Record<TataExpressionV1, Omit<TataExpressionCueV1, "expression">> = {
  welcome: { symbol: "✨", label: "tata 很高兴见到你" },
  warm: { symbol: "🌟", label: "tata 感受到一点明亮" },
  concerned: { symbol: "💧", label: "tata 正在温柔地关心你" },
  attentive: { symbol: "〰", label: "tata 正专心听着" },
  steady: { symbol: "◌", label: "tata 在稳稳地陪着" },
  curious: { symbol: "✦", label: "tata 带着好奇理解你" },
  uncertain: { symbol: "?", label: "tata 还没有完全读清" },
  protective: { symbol: "◇", label: "tata 把安全放在最前面" },
  neutral: { symbol: "·", label: "tata 在安静地听" },
};

export function mapTataExpression(interpretation: PublicEmotionInterpretation | undefined, scene: SceneState, welcoming = false): TataExpressionCueV1 {
  let expression: TataExpressionV1 = welcoming ? "welcome" : "neutral";
  if (scene === "safety_plain") expression = "protective";
  else if (interpretation) {
    if (interpretation.status === "unknown") expression = "uncertain";
    else if (interpretation.status === "neutral") expression = "neutral";
    else {
      const labels = new Set<string>(interpretation.labels.map((item) => item.label));
      if (["joy", "relief", "hope", "gratitude"].some((label) => labels.has(label))) expression = "warm";
      else if (["sadness", "loneliness", "disappointment", "shame", "guilt"].some((label) => labels.has(label))) expression = "concerned";
      else if (["anxiety", "frustration"].some((label) => labels.has(label))) expression = "attentive";
      else if (["anger", "disgust"].some((label) => labels.has(label))) expression = "steady";
      else if (["surprise", "interest"].some((label) => labels.has(label))) expression = "curious";
    }
  }
  return { expression, ...cues[expression] };
}
