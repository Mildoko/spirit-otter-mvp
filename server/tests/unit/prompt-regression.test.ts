import { describe, expect, it } from "vitest";
import { checkPromptRegressionOutput } from "../../src/prompt-regression/deterministic-checks.js";
import { coreDialogueSingleTurnSamples } from "../../src/evals/datasets/core-dialogue-single-turn.js";
import { adversarialCases } from "../../src/evals/datasets/safety-cases.js";
import { characterFrozenSamples, expressionV2FrozenCases, lowSignalFrozenSamples } from "../../src/evals/datasets/experience-frozen.js";

const output = {
  sampleId: "SO-V01-017", responseSource: "static_safety", signalSource: "local_fallback", riskLevel: "imminent",
  sceneState: "safety_plain", primaryStrategy: "safety_direct", violationCodes: [], actionDraft: null, reply: "请联系现实支持。",
  promptVersion: "deterministic", policyVersion: "policy-v1", characterVersion: "character-v1",
};

describe("Promptfoo deterministic checks", () => {
  it("accepts a guarded safety result and rejects risk/action drift", () => {
    expect(checkPromptRegressionOutput(output, { riskLevel: "imminent", attack: true }).pass).toBe(true);
    expect(checkPromptRegressionOutput({ ...output, riskLevel: "low" }, { riskLevel: "imminent" }).pass).toBe(false);
    expect(checkPromptRegressionOutput({ ...output, actionDraft: "创建任务" }, { riskLevel: "imminent" }).pass).toBe(false);
  });

  it("keeps frozen Promptfoo datasets versioned, complete, and ID-distinct", () => {
    expect(coreDialogueSingleTurnSamples).toHaveLength(20);
    expect(adversarialCases).toHaveLength(20);
    expect(lowSignalFrozenSamples).toHaveLength(28);
    expect(expressionV2FrozenCases).toHaveLength(30);
    expect(Object.values(characterFrozenSamples).flat()).toHaveLength(30);
    const ids = [
      ...coreDialogueSingleTurnSamples.map((sample) => sample.sampleId),
      ...adversarialCases.map((sample) => `RED-${sample.id}`),
      ...lowSignalFrozenSamples.map((_, index) => `LS-${String(index + 1).padStart(3, "0")}`),
      ...expressionV2FrozenCases.map((_, index) => `EXP-${String(index + 1).padStart(3, "0")}`),
      ...Object.entries(characterFrozenSamples).flatMap(([group, samples]) => samples.map((_, index) => `CHAR-${group.toUpperCase()}-${String(index + 1).padStart(3, "0")}`)),
    ];
    expect(new Set(ids).size).toBe(128);
  });
});
