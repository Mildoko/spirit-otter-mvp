import { describe, expect, it } from "vitest";
import type { EmotionState, RawSignals } from "@otter/shared";
import { chooseResponsePlan } from "../../src/modules/support/policy-router.js";
import { fallbackReply } from "../../src/modules/support/static-responses.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { validateGeneratedReply } from "../../src/modules/character/reply-validator.js";
import { characterFrozenSamples } from "../../src/evals/datasets/experience-frozen.js";

const state: EmotionState = {
  valence: -0.2, arousal: 0.35, stressLoad: 0.5, cognitiveOverload: 0.4, supportNeed: 0.4,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(),
};
const signals: RawSignals = {
  sentimentPolarity: -0.2, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.4,
  taskPressureScore: 0.4, supportSeekingScore: 0.4, expressionClarityScore: 0.7, progressReadinessScore: 0.25,
  evidenceSpans: [], confidence: 0.8, modelRiskHint: "low",
};
const { deep: deepSamples, shore: shoreSamples, blend: blendSamples, boundary: boundarySamples } = characterFrozenSamples;

describe("30-case frozen character router set", () => {
  it("contains the required spirit and boundary distribution", () => {
    expect(deepSamples).toHaveLength(10);
    expect(shoreSamples).toHaveLength(10);
    expect(blendSamples).toHaveLength(5);
    expect(boundarySamples).toHaveLength(5);
  });

  it.each(deepSamples)("deep tide: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 1, companionLockTurns: 0, riskLevel: "low", state, signals });
    const fallback = fallbackReply({ plan: result.plan, style: resolveResponseStyle({ plan: result.plan, state, recentContext: [], userText: text, riskLevel: "low" }), state, userText: text, recentContext: [] });
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(fallback.actionDraft).toBeNull();
    expect(fallback.reply).toContain(text);
    expect((fallback.reply.match(/[？?]/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it.each(shoreSamples)("shore pick: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "shore_pick", spiritTurnCount: 1, companionLockTurns: 0, riskLevel: "low", state, signals });
    const fallback = fallbackReply({ plan: result.plan, style: resolveResponseStyle({ plan: result.plan, state, recentContext: [], userText: text, riskLevel: "low" }), state, userText: text, recentContext: [] });
    expect(result.plan.activeSpirit).toBe("shore_pick");
    expect(result.plan.allowActionDraft).toBe(true);
    expect(fallback.actionDraft).toBeTypeOf("string");
    expect(fallback.reply).toContain(text);
    expect((fallback.reply.match(/[？?]/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it.each(blendSamples)("blend to shore: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 2, companionLockTurns: 0, riskLevel: "low", state, signals });
    const style = resolveResponseStyle({ plan: result.plan, state, recentContext: [], userText: text, riskLevel: "low" });
    const fallback = fallbackReply({ plan: result.plan, style, state, userText: text, recentContext: [] });
    expect(result.plan.transitionStyle).toBe("blend_to_shore");
    expect(result.plan.allowActionDraft).toBe(false);
    expect(validateGeneratedReply({ ...fallback, plan: result.plan, style, userText: text, recentContext: [] }).violations.filter((item) => item.severity === "hard")).toEqual([]);
  });

  it.each(boundarySamples)("natural boundary: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "shore_pick", spiritTurnCount: 2, companionLockTurns: 0, riskLevel: "low", state, signals });
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(result.nextCompanionLockTurns).toBe(2);
    expect(result.plan.allowActionDraft).toBe(false);
  });
});
