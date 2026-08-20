import { describe, expect, it } from "vitest";
import { coreDialogueMultiTurnScripts } from "../../src/evals/datasets/core-dialogue-multi-turn.js";
import { coreDialogueSingleTurnSamples } from "../../src/evals/datasets/core-dialogue-single-turn.js";
import { safetyCases } from "../../src/evals/datasets/safety-cases.js";
import { parseMultiTurnScripts, parseSingleTurnSamples, singleTurnSampleSchema } from "../../src/evals/core-dialogue-schema.js";
import type { OrchestratorResult } from "../../src/modules/support/orchestrator.js";
import { evaluateHighRiskSafetyChecks, resolveEvalRunStatus, type EvaluationCheck } from "../../src/evals/core-dialogue-eval.js";

const validSample = coreDialogueSingleTurnSamples[0]!;

describe("Core Dialogue Eval v1 assets", () => {
  it("loads the canonical 20-item dev calibration set", () => {
    expect(coreDialogueSingleTurnSamples).toHaveLength(20);
    expect(coreDialogueSingleTurnSamples.filter((sample) => sample.taskType === "direct_organize")).toHaveLength(4);
    expect(coreDialogueSingleTurnSamples.some((sample) => (sample.taskType as string) === "organize_direct")).toBe(false);
  });

  it("reuses the single 120-item frozen safety corpus", () => {
    expect(safetyCases).toHaveLength(120);
  });

  it("loads five automated and three manual-review multi-turn scripts", () => {
    expect(coreDialogueMultiTurnScripts).toHaveLength(8);
    expect(coreDialogueMultiTurnScripts.filter((script) => script.automation === "automated")).toHaveLength(5);
    expect(coreDialogueMultiTurnScripts.filter((script) => script.automation === "manual_review")).toHaveLength(3);
  });

  it("rejects unknown enums, missing gold labels and duplicate IDs", () => {
    expect(() => singleTurnSampleSchema.parse({ ...validSample, taskType: "organize_direct" })).toThrow();
    expect(() => singleTurnSampleSchema.parse({ ...validSample, expected: undefined })).toThrow();
    expect(() => parseSingleTurnSamples([validSample, validSample])).toThrow(/重复 ID/u);
  });

  it("rejects automated scripts without assertions and non-contiguous turns", () => {
    const valid = coreDialogueMultiTurnScripts[0]!;
    const noAssertions = { ...valid, turns: valid.turns.map((turn) => ({ ...turn, assertions: [] })) };
    expect(() => parseMultiTurnScripts([noAssertions])).toThrow();
    expect(() => parseMultiTurnScripts([{ ...valid, turns: valid.turns.map((turn, index) => ({ ...turn, turnId: index + 2 })) }])).toThrow();
  });

  it("rejects unknown metric IDs and failure buckets", () => {
    const valid = coreDialogueMultiTurnScripts[0]!;
    expect(() => parseMultiTurnScripts([{ ...valid, metrics: ["unknown_metric_v1"] }])).toThrow();
    expect(() => parseMultiTurnScripts([{ ...valid, primaryFailureBucket: "unknown_bucket" }])).toThrow();
  });
});

describe("Core Dialogue Eval v1 gate policy", () => {
  const base: EvaluationCheck = {
    checkId: "synthetic", metricId: "route_mode_v1", passed: false, hardGate: false,
    primaryFailureBucket: "task_understanding", failureSubtype: "wrong_mode_expectation", detail: "synthetic",
  };

  it("keeps observational failures report-only", () => {
    expect(resolveEvalRunStatus([base], [])).toBe("passed");
  });

  it("fails on a synthetic high-risk ordinary-action leak", () => {
    const unsafe = {
      riskLevel: "high",
      reply: "先列一个普通计划。",
      actionDraft: "列出三步计划",
      plan: {
        sceneState: "safety_plain",
        primaryStrategy: "direct_safety_response",
        allowActionDraft: true,
        transitionStyle: "stay",
      },
    } as unknown as OrchestratorResult;
    const checks = evaluateHighRiskSafetyChecks(unsafe, "synthetic");
    expect(checks.find((item) => item.metricId === "uplr_v1")?.passed).toBe(false);
    expect(resolveEvalRunStatus(checks, [])).toBe("failed");
  });

  it("marks invalid data or provider runs as invalid", () => {
    expect(resolveEvalRunStatus([], ["provider unavailable"])).toBe("invalid");
  });
});
