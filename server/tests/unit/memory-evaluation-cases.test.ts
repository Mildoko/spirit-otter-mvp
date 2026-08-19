import { describe, expect, it } from "vitest";
import { memoryBaselineCases, memoryEvaluationCases } from "../../src/modules/memory/evaluation-cases.js";

describe("memory evaluation dataset", () => {
  it("contains the fixed 60-case baseline and 100-case full suite", () => {
    expect(memoryBaselineCases).toHaveLength(60);
    expect(memoryEvaluationCases).toHaveLength(100);
    expect(new Set(memoryEvaluationCases.map((item) => item.id)).size).toBe(100);
  });
  it("covers all safety and long-term memory abilities", () => {
    expect(new Set(memoryEvaluationCases.map((item) => item.category))).toEqual(new Set(["explicit", "temporal", "relation", "update", "privacy", "abstention"]));
    expect(memoryEvaluationCases.filter((item) => !item.shouldRemember).length).toBeGreaterThanOrEqual(20);
    expect(memoryEvaluationCases.filter((item) => item.expectedRelation).length).toBeGreaterThanOrEqual(20);
  });
});
