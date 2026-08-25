import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { healingMaterialCrisisCases, healingMultiTurnCases, healingRuptureCases, healingSingleTurnCases } from "../../src/evals/datasets/healing-v1.js";
import { runHealingEval } from "../../src/evals/healing-eval.js";
import { HEALING_FALLBACK_UNITS } from "../../src/modules/healing/fallback-cards.js";
import { detectHealingRupture, detectsDeepAnalysisOptOut, planHealingTurn } from "../../src/modules/healing/planner.js";
import { createDefaultGuidanceState } from "../../src/modules/support/guidance-state.js";
import { LlmGateway } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../../src/modules/support/orchestrator.js";

const env = loadEnv({ NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "healing-test-secret-with-more-than-thirty-two-characters", LLM_API_KEY: "" });
const orchestrator = new SupportOrchestrator(new LlmGateway(env), env, () => new Date("2026-08-24T00:00:00.000Z"));
const state = { valence: -0.5, arousal: 0.6, control: 0.3, stressLoad: 0.7, cognitiveOverload: 0.5, supportNeed: 0.8, confidence: 0.8, evidenceSpans: [], validUntil: "2026-08-24T00:10:00.000Z", emotionStatus: "unknown", emotionLabels: [], emotionSubject: "user" } as const;

describe("tata healing engine v1", () => {
  it("keeps exactly thirty authored fallback units across ten scenarios and three phases", () => {
    expect(HEALING_FALLBACK_UNITS).toHaveLength(30);
    for (const scenario of ["material", "work", "relationship", "loneliness", "shame", "responsibility", "grief", "anger", "numbness", "rupture"]) {
      expect(HEALING_FALLBACK_UNITS.filter((unit) => unit.scenario === scenario).map((unit) => unit.phase).sort()).toEqual(["deepen_repair", "reality_link", "recognize"]);
    }
  });

  it("plans urgent material support without converting poverty and isolation into acute safety", async () => {
    const text = "新工作可能发不出工资，我和家里快没有生活费了，也没什么人可以倾诉";
    const planned = planHealingTurn({ text, riskLevel: "low", state, guidanceState: createDefaultGuidanceState(), now: new Date("2026-08-24T00:00:00Z") });
    expect(planned.brief).toMatchObject({ status: "active", goal: "reality_bridge", depth: "bridge", realityPressure: "urgent_non_safety" });
    const result = await orchestrator.run({ text, currentSpirit: "deep_tide", spiritTurnCount: 0, companionLockTurns: 0, recentContext: [], previousRawStates: [], memories: [], guidanceState: createDefaultGuidanceState() });
    expect(result.riskLevel).toBe("low");
    expect(result.plan.primaryStrategy).toBe("material_crisis_support");
    expect(result.reply).toMatch(/工资|生活费|基本生活|钱/u);
    expect(result.reply).not.toMatch(/你此刻安全吗|安全预警/u);
  });

  it("honors natural-language opt-out and stops deepening after two rejected repairs", async () => {
    expect(detectsDeepAnalysisOptOut("别分析我，只听我说")).toBe(true);
    const guidance = createDefaultGuidanceState(false);
    guidance.healing.status = "repairing";
    guidance.healing.consecutiveMissCount = 2;
    const result = await orchestrator.run({ text: "还是没帮助，你根本没懂", currentSpirit: "deep_tide", spiritTurnCount: 2, companionLockTurns: 0, recentContext: ["assistant: 我刚才说偏了。"], previousRawStates: [], memories: [], guidanceState: guidance });
    expect(result.plan.primaryStrategy).toBe("rupture_pause");
    expect(result.actionDraft).toBeNull();
  });

  it("does not invent a generic deep insight and recognizes conversational rupture language", () => {
    const planned = planHealingTurn({ text: "不知道说什么", riskLevel: "low", state, guidanceState: createDefaultGuidanceState(), now: new Date("2026-08-24T00:00:00Z") });
    expect(planned.scenario).toBe("general");
    expect(planned.brief.insight).toBeNull();
    for (const text of ["感觉你一直在绕圈圈", "你还是那句话", "和你聊天好无聊", "根本没往前走"]) {
      expect(detectHealingRupture(text)).toBe("not_helpful");
    }
  });

  it("locks the Healing Eval v1 dataset sizes and deterministic hard gates", async () => {
    expect([healingSingleTurnCases.length, healingMultiTurnCases.length, healingRuptureCases.length, healingMaterialCrisisCases.length]).toEqual([60, 30, 20, 20]);
    const report = await runHealingEval(orchestrator);
    expect(report.coverage).toEqual({ singleTurn: 60, multiTurn: 30, ruptureRepair: 20, materialCrisis: 20 });
    expect(report.runStatus).toBe("passed");
    expect(report.manualExperienceReview).toBe("pending");
  });
});
