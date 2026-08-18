import type {
  EmotionCorrectionV1,
  EmotionHypothesisV1,
  EmotionLabelScoreV1,
  EmotionLabelV1,
  PublicEmotionInterpretation,
  RawSignals,
} from "@otter/shared";

export const EMOTION_SCHEMA_VERSION = 1 as const;

export const emotionDisplayNames: Record<EmotionLabelV1, string> = {
  joy: "喜悦", relief: "释然", hope: "希望", interest: "兴趣", gratitude: "感激",
  sadness: "悲伤", anger: "愤怒", anxiety: "焦虑/恐惧", frustration: "挫败",
  disappointment: "失望", disgust: "厌恶", shame: "羞耻", guilt: "内疚",
  loneliness: "孤独", surprise: "惊讶",
};

const terms: Record<EmotionLabelV1, string[]> = {
  joy: ["开心", "高兴", "快乐", "喜悦"],
  relief: ["释然", "松了口气", "松口气", "轻松多了"],
  hope: ["有希望", "抱有希望", "期待会好"],
  interest: ["感兴趣", "很好奇", "有兴趣"],
  gratitude: ["感激", "感谢", "很谢谢"],
  sadness: ["悲伤", "伤心", "难过", "委屈"],
  anger: ["愤怒", "生气", "火大", "恼火"],
  anxiety: ["焦虑", "害怕", "担心", "紧张", "不安"],
  frustration: ["挫败", "受挫", "怎么都做不好", "努力没用", "没用"],
  disappointment: ["失望", "心凉"],
  disgust: ["厌恶", "反感", "恶心"],
  shame: ["羞耻", "羞愧", "丢人"],
  guilt: ["内疚", "愧疚", "自责"],
  loneliness: ["孤独", "寂寞", "没人懂"],
  surprise: ["惊讶", "意外", "没想到"],
};

const defaultHypothesis = (signals: RawSignals): EmotionHypothesisV1 => ({
  schemaVersion: EMOTION_SCHEMA_VERSION,
  status: "unknown",
  subject: "unknown",
  valence: signals.sentimentPolarity,
  arousal: Math.max(0, Math.min(1, signals.urgencyScore * 0.7 + signals.overloadCueScore * 0.3)),
  control: 0.5,
  labels: [],
  confidence: Math.min(signals.confidence, 0.35),
});

function isNegated(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 6), index);
  return /(?:不是|并非|并不|没有|没|不)(?:太|很|特别|真的|怎么)?$/u.test(prefix);
}

function isOtherSubject(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 12), index);
  return /(?:他|她|他们|她们|对方).{0,5}(?:说|觉得|感到|很|非常)$/u.test(prefix);
}

function isHypothetical(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 18), index);
  return /(?:如果|假如|要是|可能会|也许会)/u.test(prefix);
}

function allTermMatches(text: string): Array<{ label: EmotionLabelV1; term: string; index: number }> {
  const matches: Array<{ label: EmotionLabelV1; term: string; index: number }> = [];
  for (const [label, values] of Object.entries(terms) as Array<[EmotionLabelV1, string[]]>) {
    for (const term of values) {
      let offset = 0;
      while (offset < text.length) {
        const index = text.indexOf(term, offset);
        if (index < 0) break;
        matches.push({ label, term, index });
        offset = index + term.length;
      }
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

export function detectExplicitEmotion(text: string): { labels: EmotionLabelScoreV1[]; ruleCodes: string[] } | null {
  const matches = allTermMatches(text);
  if (matches.length === 0) return null;

  const correction = /(?:不是|不算|并非)([^，。；]{1,10})[，,；; ]*(?:是|更像|其实是)([^，。；]{1,10})/u.exec(text);
  if (correction) {
    const replacement = matches.find((match) => match.index >= (correction.index + correction[0].indexOf(correction[2]!)));
    if (replacement) {
      return {
        labels: [{ label: replacement.label, intensity: 0.65, confidence: 0.99, evidenceSpans: [replacement.term] }],
        ruleCodes: ["EXPLICIT_EMOTION_CORRECTION"],
      };
    }
  }

  const candidates = matches.filter((match) => {
    if (isNegated(text, match.index) || isOtherSubject(text, match.index) || isHypothetical(text, match.index)) return false;
    const prefix = text.slice(Math.max(0, match.index - 10), match.index);
    const explicitFirstPerson = /(?:我|自己|心里|现在|此刻).{0,7}$/u.test(prefix);
    const compactSelfReport = text.length <= 18 && !/(?:他说|她说|对方说|如果|假如|要是)/u.test(text);
    return explicitFirstPerson || compactSelfReport;
  });
  const unique = [...new Map(candidates.map((item) => [item.label, item])).values()].slice(0, 2);
  if (unique.length === 0) return null;
  return {
    labels: unique.map((item) => ({
      label: item.label,
      intensity: /(?:非常|特别|太|极其|真的)/u.test(text.slice(Math.max(0, item.index - 5), item.index)) ? 0.85 : 0.65,
      confidence: 0.98,
      evidenceSpans: [item.term],
    })),
    ruleCodes: ["EXPLICIT_EMOTION_SELF_REPORT"],
  };
}

function validModelHypothesis(text: string, value: EmotionHypothesisV1 | undefined): EmotionHypothesisV1 | null {
  if (!value) return null;
  if (value.status === "user_corrected") return null;
  if (value.status === "unknown" || value.status === "neutral") return { ...value, labels: [] };
  const labels = value.labels.filter((item) => item.evidenceSpans.length > 0 && item.evidenceSpans.every((span) => text.includes(span)));
  if (labels.length === 0) return null;
  return { ...value, labels: labels.slice(0, 2) };
}

function correctionHypothesis(signals: RawSignals, correction: EmotionCorrectionV1): EmotionHypothesisV1 | null {
  if (correction.verdict === "accurate") return null;
  if (correction.verdict === "unknown" || correction.verdict === "neutral") {
    return { ...defaultHypothesis(signals), status: correction.verdict, subject: "user", confidence: 1 };
  }
  if (correction.labels.length === 0) return null;
  return {
    ...defaultHypothesis(signals),
    status: "user_corrected",
    subject: "user",
    labels: correction.labels.slice(0, 2).map((item) => ({
      label: item.label,
      intensity: item.intensityLevel / 5,
      confidence: 1,
      evidenceSpans: ["用户主动纠正"],
    })),
    confidence: 1,
  };
}

export function resolveEmotionHypothesis(input: {
  text: string;
  signals: RawSignals;
  previousCorrection?: EmotionCorrectionV1;
  enabled: boolean;
}): { hypothesis: EmotionHypothesisV1; ruleCodes: string[] } {
  if (!input.enabled) return { hypothesis: defaultHypothesis(input.signals), ruleCodes: ["EMOTION_V2_DISABLED"] };
  const explicit = detectExplicitEmotion(input.text);
  if (explicit) {
    const base = validModelHypothesis(input.text, input.signals.emotionInference) ?? defaultHypothesis(input.signals);
    return {
      hypothesis: { ...base, status: "inferred", subject: "user", labels: explicit.labels, confidence: 0.98 },
      ruleCodes: explicit.ruleCodes,
    };
  }
  if (input.previousCorrection) {
    const corrected = correctionHypothesis(input.signals, input.previousCorrection);
    if (corrected) return { hypothesis: corrected, ruleCodes: ["PREVIOUS_USER_EMOTION_CORRECTION"] };
  }
  const model = validModelHypothesis(input.text, input.signals.emotionInference);
  if (model) return { hypothesis: model, ruleCodes: ["MODEL_EMOTION_INFERENCE"] };
  return { hypothesis: defaultHypothesis(input.signals), ruleCodes: ["EMOTION_EVIDENCE_MISSING"] };
}

const intensityLevel = (value: number): 1 | 2 | 3 | 4 | 5 => Math.max(1, Math.min(5, Math.ceil(value * 5))) as 1 | 2 | 3 | 4 | 5;

export function buildPublicEmotionInterpretation(hypothesis: EmotionHypothesisV1, canCorrect = true): PublicEmotionInterpretation {
  const visible = hypothesis.subject === "other"
    ? { ...hypothesis, status: "unknown" as const, labels: [] }
    : hypothesis;
  return {
    status: visible.status,
    labels: visible.labels.map((item) => ({
      label: item.label,
      displayName: emotionDisplayNames[item.label],
      intensityLevel: intensityLevel(item.intensity),
    })),
    disclaimer: "这是 AI 对这一刻的推测，不是诊断，可能不准确。",
    canCorrect,
  };
}
