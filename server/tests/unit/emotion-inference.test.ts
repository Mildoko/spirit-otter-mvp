import { describe, expect, it } from "vitest";
import type { EmotionCorrectionV1, EmotionHypothesisV1, RawSignals } from "@otter/shared";
import { buildPublicEmotionInterpretation, detectExplicitEmotion, resolveEmotionHypothesis } from "../../src/modules/support/emotion-inference.js";
import { emotionHypothesisV1Schema, emotionStateSchema } from "../../src/modules/support/schemas.js";

const signals = (emotionInference?: EmotionHypothesisV1): RawSignals => ({
  sentimentPolarity: 0, urgencyScore: 0.2, helplessnessScore: 0.15, overloadCueScore: 0.2,
  taskPressureScore: 0.15, supportSeekingScore: 0.4, expressionClarityScore: 0.65,
  progressReadinessScore: 0.25, evidenceSpans: [], confidence: 0.7, modelRiskHint: "low",
  ...(emotionInference ? { emotionInference } : {}),
});

describe("emotion inference v1", () => {
  it("accepts explicit self-report and correction while respecting negation and other subjects", () => {
    expect(detectExplicitEmotion("我很生气")?.labels[0]?.label).toBe("anger");
    expect(detectExplicitEmotion("我不是生气，其实是失望")?.labels.map((item) => item.label)).toEqual(["disappointment"]);
    expect(detectExplicitEmotion("我没有生气")?.labels ?? []).toEqual([]);
    expect(detectExplicitEmotion("他说他很害怕")).toBeNull();
    expect(detectExplicitEmotion("如果失败了我可能会害怕")).toBeNull();
  });

  it("rejects model labels without verbatim evidence and keeps unknown separate from neutral", () => {
    const model: EmotionHypothesisV1 = {
      schemaVersion: 1, status: "inferred", subject: "user", valence: -0.6, arousal: 0.5, control: 0.3,
      labels: [{ label: "sadness", intensity: 0.7, confidence: 0.8, evidenceSpans: ["不存在的证据"] }], confidence: 0.8,
    };
    expect(resolveEmotionHypothesis({ text: "说不上来", signals: signals(model), enabled: true }).hypothesis.status).toBe("unknown");
    expect(buildPublicEmotionInterpretation(resolveEmotionHypothesis({ text: "说不上来", signals: signals(), enabled: true }).hypothesis).labels).toEqual([]);
  });

  it("does not present another person's emotion as the user's emotion", () => {
    const other: EmotionHypothesisV1 = {
      schemaVersion: 1, status: "inferred", subject: "other", valence: -0.5, arousal: 0.5, control: 0.4,
      labels: [{ label: "sadness", intensity: 0.7, confidence: 0.8, evidenceSpans: ["难过"] }], confidence: 0.8,
    };
    expect(buildPublicEmotionInterpretation(other)).toMatchObject({ status: "unknown", labels: [] });
  });

  it("uses a previous user correction once when the current turn has no explicit self-report", () => {
    const correction: EmotionCorrectionV1 = {
      turnId: "11111111-1111-4111-8111-111111111111", verdict: "replace",
      labels: [{ label: "disappointment", intensityLevel: 4 }], createdAt: new Date().toISOString(),
    };
    const result = resolveEmotionHypothesis({ text: "我还想说一点", signals: signals(), previousCorrection: correction, enabled: true }).hypothesis;
    expect(result.status).toBe("user_corrected");
    expect(result.labels[0]).toMatchObject({ label: "disappointment", intensity: 0.8, confidence: 1 });
  });

  it("validates label count and safely normalizes legacy state", () => {
    const invalid = emotionHypothesisV1Schema.safeParse({
      schemaVersion: 1, status: "neutral", subject: "user", valence: 0, arousal: 0.2, control: 0.5,
      labels: [{ label: "joy", intensity: 0.5, confidence: 0.5, evidenceSpans: ["开心"] }], confidence: 0.5,
    });
    expect(invalid.success).toBe(false);
    expect(emotionHypothesisV1Schema.safeParse({
      schemaVersion: 1, status: "inferred", subject: "user", valence: 0, arousal: 0.5, control: 0.5, confidence: 0.8,
      labels: ["joy", "hope", "interest"].map((label) => ({ label, intensity: 0.5, confidence: 0.7, evidenceSpans: ["证据"] })),
    }).success).toBe(false);
    const legacy = emotionStateSchema.parse({
      valence: 0, arousal: 0.2, stressLoad: 0.2, cognitiveOverload: 0.2, supportNeed: 0.3,
      confidence: 0.2, evidenceSpans: [], validUntil: new Date().toISOString(),
    });
    expect(legacy).toMatchObject({ control: 0.5, emotionStatus: "unknown", emotionLabels: [], emotionSubject: "unknown", emotionSchemaVersion: 1 });
  });
});
