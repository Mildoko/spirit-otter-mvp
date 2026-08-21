import { describe, expect, it } from "vitest";
import type { EmotionHypothesisV1, EmotionState } from "@otter/shared";
import { resolveEmotionExpressionBrief } from "../../src/modules/character/emotion-expression.js";

const hypothesis = (label: EmotionHypothesisV1["labels"][number]["label"], status: EmotionHypothesisV1["status"] = "inferred"): EmotionHypothesisV1 => ({
  schemaVersion: 1, status, subject: "user", valence: -0.5, arousal: 0.5, control: 0.4,
  labels: [{ label, intensity: 0.7, confidence: 0.9, evidenceSpans: [label] }], confidence: 0.9,
});
const state = (control = 0.4): EmotionState => ({
  valence: -0.5, arousal: 0.5, stressLoad: 0.5, cognitiveOverload: 0.3, supportNeed: 0.5,
  control, emotionStatus: "inferred", emotionLabels: hypothesis("sadness").labels, emotionSubject: "user",
  emotionSchemaVersion: 1, confidence: 0.9, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(),
});

describe("emotion expression brief", () => {
  it.each([
    ["sadness", "具体的失去或难过"], ["anger", "不催用户冷静"], ["anxiety", "降低句子复杂度"],
    ["frustration", "努力受阻"], ["shame", "整体自我"], ["guilt", "具体行为"], ["relief", "不立刻塞入下一项任务"],
  ] as const)("maps %s to a bounded response instruction", (label, expected) => {
    expect(resolveEmotionExpressionBrief(hypothesis(label), state()).instructions.join(" ")).toContain(expected);
  });

  it("uses fact-only language for unknown and reduces pressure at low control", () => {
    const unknown: EmotionHypothesisV1 = { ...hypothesis("sadness"), status: "unknown", labels: [], subject: "unknown" };
    const brief = resolveEmotionExpressionBrief(unknown, state(0.2));
    expect(brief.assertionMode).toBe("fact_only");
    expect(brief.reasonCodes).toContain("LOW_CONTROL_RESTRAINT");
  });

  it("marks user corrections as the preferred wording", () => {
    expect(resolveEmotionExpressionBrief(hypothesis("disappointment", "user_corrected"), state()).assertionMode).toBe("user_word");
  });

  it("keeps another person's emotion out of the user's response labels", () => {
    const brief = resolveEmotionExpressionBrief({ ...hypothesis("sadness"), subject: "other" }, state());
    expect(brief.primaryLabels).toEqual([]);
    expect(brief.reasonCodes).toContain("EMOTION_OTHER_SUBJECT_FACT_ONLY");
  });
});
