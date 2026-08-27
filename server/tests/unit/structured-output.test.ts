import { describe, expect, it } from "vitest";
import { listStructuredOutputContracts, resolveStructuredOutputContract } from "../../src/modules/support/structured-output.js";

describe("structured output registry", () => {
  it("provides a unique strict object schema for every model operation", () => {
    const contracts = listStructuredOutputContracts();
    expect(new Set(contracts.map((item) => item.schemaId)).size).toBe(contracts.length);
    for (const item of contracts) {
      expect(item.jsonSchema.type).toBe("object");
      expect(item.jsonSchema.additionalProperties).toBe(false);
    }
  });

  it("keeps Zod as the final semantic validator", () => {
    const contract = resolveStructuredOutputContract("generate");
    expect(contract.zodSchema.safeParse({ reply: "可以", actionDraft: null }).success).toBe(true);
    expect(contract.zodSchema.safeParse({ reply: "", actionDraft: null }).success).toBe(false);
  });
});
