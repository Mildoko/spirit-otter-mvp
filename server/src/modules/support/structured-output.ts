import { z, type ZodType } from "zod";
import { memoryExtractionSchema } from "../memory/schemas.js";
import { generatedReplySchema, healingCritiqueSchema, rawSignalsSchema, rawSignalsWithEmotionSchema } from "./schemas.js";
import type { LlmOperation } from "./llm-gateway.js";

export interface StructuredOutputContract<T = unknown> {
  schemaId: string;
  zodSchema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
}

function contract<T>(schemaId: string, zodSchema: ZodType<T>): StructuredOutputContract<T> {
  const generated = z.toJSONSchema(zodSchema, { target: "draft-7", unrepresentable: "any" });
  return { schemaId, zodSchema, jsonSchema: generated as Record<string, unknown> };
}

const contracts = {
  analyze: contract("raw_signals_v1", rawSignalsSchema),
  analyze_emotion_v2: contract("raw_signals_emotion_v2", rawSignalsWithEmotionSchema),
  generate: contract("generated_reply_v1", generatedReplySchema),
  repair: contract("generated_reply_repair_v1", generatedReplySchema),
  critique_healing: contract("healing_critique_v1", healingCritiqueSchema),
  extract_memories: contract("memory_extraction_v2", memoryExtractionSchema),
} as const;

export type StructuredOutputContractKey = keyof typeof contracts;

export function resolveStructuredOutputContract(operation: LlmOperation, emotionV2Enabled = false): StructuredOutputContract {
  if (operation === "analyze") return emotionV2Enabled ? contracts.analyze_emotion_v2 : contracts.analyze;
  return contracts[operation];
}

export function listStructuredOutputContracts(): StructuredOutputContract[] {
  return Object.values(contracts);
}
