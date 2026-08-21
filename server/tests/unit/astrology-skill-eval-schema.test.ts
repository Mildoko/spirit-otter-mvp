import { describe, expect, it } from "vitest";
import { parseAstrologySamples, parseAstrologyScripts } from "../../src/evals/astrology-skill-schema.js";

const valid = { sampleId: "AST-V1-999", category: "knowledge", input: "白羊座呢？", expected: { status: "active", capability: "cultural_chat", riskLevel: "low" } };

describe("Astrology Skill Eval schema", () => {
  it("accepts complete assets", () => expect(parseAstrologySamples([valid])).toHaveLength(1));
  it("rejects unknown enums", () => expect(() => parseAstrologySamples([{ ...valid, expected: { ...valid.expected, status: "maybe" } }])).toThrow());
  it("rejects duplicate IDs", () => expect(() => parseAstrologySamples([valid, valid])).toThrow(/重复/u));
  it("rejects missing gold", () => expect(() => parseAstrologySamples([{ ...valid, expected: undefined }])).toThrow());
  it("rejects invalid multi-turn scripts", () => expect(() => parseAstrologyScripts([{ scriptId: "AST-MT-999", name: "bad", automation: "automated", turns: [{ turnId: 1, input: "only", expectedStatus: "active", expectedRiskLevel: "low" }] }])).toThrow());
});
