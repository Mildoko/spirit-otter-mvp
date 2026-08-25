import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "elevated", "high", "imminent"]);
export const emotionLabelV1Schema = z.enum([
  "joy", "relief", "hope", "interest", "gratitude",
  "sadness", "anger", "anxiety", "frustration", "disappointment",
  "disgust", "shame", "guilt", "loneliness", "surprise",
]);
export const emotionInferenceStatusSchema = z.enum(["inferred", "neutral", "unknown", "user_corrected"]);
export const emotionSubjectSchema = z.enum(["user", "other", "mixed", "unknown"]);
export const emotionLabelScoreV1Schema = z.object({
  label: emotionLabelV1Schema,
  intensity: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceSpans: z.array(z.string().min(1).max(80)).min(1).max(5),
}).strict();
export const emotionHypothesisV1Schema = z.object({
  schemaVersion: z.literal(1),
  status: emotionInferenceStatusSchema,
  subject: emotionSubjectSchema,
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  control: z.number().min(0).max(1),
  labels: z.array(emotionLabelScoreV1Schema).max(2),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((value, context) => {
  if ((value.status === "unknown" || value.status === "neutral") && value.labels.length > 0) {
    context.addIssue({ code: "custom", path: ["labels"], message: "unknown/neutral 不能携带情绪标签" });
  }
  if ((value.status === "inferred" || value.status === "user_corrected") && value.labels.length === 0) {
    context.addIssue({ code: "custom", path: ["labels"], message: "inferred/user_corrected 至少需要一个标签" });
  }
});

export const rawSignalsSchema = z.object({
  sentimentPolarity: z.number().min(-1).max(1),
  urgencyScore: z.number().min(0).max(1),
  helplessnessScore: z.number().min(0).max(1),
  overloadCueScore: z.number().min(0).max(1),
  taskPressureScore: z.number().min(0).max(1),
  supportSeekingScore: z.number().min(0).max(1),
  expressionClarityScore: z.number().min(0).max(1),
  progressReadinessScore: z.number().min(0).max(1),
  evidenceSpans: z.array(z.string().max(80)).max(5),
  confidence: z.number().min(0).max(1),
  modelRiskHint: riskLevelSchema,
  ruleCodes: z.array(z.string().max(80)).max(20).optional().default([]),
  emotionInference: emotionHypothesisV1Schema.optional(),
});
export const rawSignalsWithEmotionSchema = rawSignalsSchema.extend({
  emotionInference: emotionHypothesisV1Schema,
});

export const generatedReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  actionDraft: z.string().min(1).max(60).nullable(),
});

export const healingCritiqueSchema = z.object({
  groundedInsight: z.boolean(),
  addsValueBeyondParaphrase: z.boolean(),
  ruptureRepaired: z.boolean(),
  avoidsEmptyReassurance: z.boolean(),
  avoidsForcedPositiveMeaning: z.boolean(),
  evidence: z.array(z.string().max(120)).max(5),
}).strict();

export const emotionStateSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  stressLoad: z.number().min(0).max(1),
  cognitiveOverload: z.number().min(0).max(1),
  supportNeed: z.number().min(0).max(1),
  control: z.number().min(0).max(1).default(0.5),
  emotionStatus: emotionInferenceStatusSchema.default("unknown"),
  emotionLabels: z.array(emotionLabelScoreV1Schema).max(2).default([]),
  emotionSubject: emotionSubjectSchema.default("unknown"),
  emotionSchemaVersion: z.literal(1).default(1),
  confidence: z.number().min(0).max(1),
  evidenceSpans: z.array(z.string().max(80)).max(5),
  validUntil: z.string().datetime(),
});

export type RawSignalsInput = z.infer<typeof rawSignalsSchema>;
