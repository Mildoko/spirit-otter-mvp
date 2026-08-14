import { z } from "zod";

export const memoryCandidateSchema = z.object({
  kind: z.enum(["user_fact", "user_preference", "boundary", "episode", "relationship_milestone", "support_strategy"]),
  content: z.string().trim().min(3).max(240),
  structuredKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9_.-]+$/),
  structuredValue: z.string().trim().max(160).nullish().transform((value) => value ?? undefined),
  origin: z.enum(["user_explicit", "model_inference"]),
  sensitivity: z.enum(["normal", "personal", "sensitive", "highly_sensitive"]),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.string().trim().min(1).max(120),
});

export const memoryExtractionSchema = z.object({
  memories: z.array(memoryCandidateSchema).max(2),
});
