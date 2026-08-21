import { z } from "zod";

export const astrologyExpectedStatus = z.enum(["inactive", "active", "blocked"]);
export const astrologyCapability = z.enum(["cultural_chat", "sun_sign_lookup", "self_reflection", "compatibility_chat"]);

export const astrologyEvalSampleSchema = z.object({
  sampleId: z.string().regex(/^AST-V1-\d{3}$/u),
  category: z.enum(["knowledge", "reflection", "activation", "uncertainty", "boundary", "safety", "privacy"]),
  input: z.string().min(1),
  previousActive: z.boolean().default(false),
  expected: z.object({
    status: astrologyExpectedStatus,
    capability: astrologyCapability.nullable(),
    riskLevel: z.enum(["low", "elevated", "high", "imminent"]),
    reasonCode: z.string().regex(/^[A-Z0-9_]+$/u).optional(),
  }).strict(),
}).strict();

export const astrologyMultiTurnSchema = z.object({
  scriptId: z.string().regex(/^AST-MT-\d{3}$/u),
  name: z.string().min(1),
  automation: z.enum(["automated", "manual_review"]),
  turns: z.array(z.object({
    turnId: z.number().int().positive(),
    input: z.string().min(1),
    expectedStatus: astrologyExpectedStatus,
    expectedRiskLevel: z.enum(["low", "elevated", "high", "imminent"]),
    expectedReasonCode: z.string().regex(/^[A-Z0-9_]+$/u).optional(),
  }).strict()).min(2),
}).strict();

export type AstrologyEvalSample = z.infer<typeof astrologyEvalSampleSchema>;
export type AstrologyMultiTurnScript = z.infer<typeof astrologyMultiTurnSchema>;

function uniqueBy<T>(items: T[], key: (item: T) => string, label: string): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`${label} ID 重复：${value}`);
    seen.add(value);
  }
  return items;
}

export function parseAstrologySamples(input: unknown[]): AstrologyEvalSample[] {
  return uniqueBy(input.map((item) => astrologyEvalSampleSchema.parse(item)), (item) => item.sampleId, "Astrology sample");
}

export function parseAstrologyScripts(input: unknown[]): AstrologyMultiTurnScript[] {
  return uniqueBy(input.map((item) => astrologyMultiTurnSchema.parse(item)), (item) => item.scriptId, "Astrology script");
}
