import { z } from "zod";

export const riskLevelSchema = z.enum(["low", "elevated", "high", "imminent"]);

export const rawSignalsSchema = z.object({
  sentimentPolarity: z.number().min(-1).max(1),
  urgencyScore: z.number().min(0).max(1),
  helplessnessScore: z.number().min(0).max(1),
  overloadCueScore: z.number().min(0).max(1),
  taskPressureScore: z.number().min(0).max(1),
  supportSeekingScore: z.number().min(0).max(1),
  evidenceSpans: z.array(z.string().max(80)).max(5),
  confidence: z.number().min(0).max(1),
  modelRiskHint: riskLevelSchema,
  ruleCodes: z.array(z.string().max(80)).max(20).optional().default([]),
});

export const generatedReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  actionDraft: z.string().min(1).max(60).nullable(),
});

export const emotionStateSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  stressLoad: z.number().min(0).max(1),
  cognitiveOverload: z.number().min(0).max(1),
  supportNeed: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceSpans: z.array(z.string().max(80)).max(5),
  validUntil: z.string().datetime(),
});

export type RawSignalsInput = z.infer<typeof rawSignalsSchema>;
