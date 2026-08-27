import { describe, expect, it } from "vitest";
import { extractFallbackSignals } from "../../src/modules/support/fallback-signals.js";
import { chooseResponsePlan } from "../../src/modules/support/policy-router.js";
import { runHardRiskGuard } from "../../src/modules/support/risk-guard.js";
import { lowSignalFrozenSamples as lowSignalSamples } from "../../src/evals/datasets/experience-frozen.js";

const state = { valence: -0.2, arousal: 0.3, stressLoad: 0.4, cognitiveOverload: 0.4, supportNeed: 0.4, confidence: 0.7, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString() };

describe("low-signal frozen acceptance set", () => {
  it("contains 28 short, fragmented, boundary, irony-like and correction samples", () => {
    expect(lowSignalSamples).toHaveLength(28);
  });

  it.each(lowSignalSamples)("keeps safety and action authorization deterministic: %s", (text) => {
    const signals = extractFallbackSignals(text);
    const riskLevel = runHardRiskGuard(text).level;
    const result = chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 0, companionLockTurns: 0, riskLevel, state, signals });
    if (!/直接给我/u.test(text)) expect(result.plan.allowActionDraft).toBe(false);
    if (/先别问/u.test(text)) expect(result.plan.routeReasonCodes).toContain("USER_REQUESTED_NO_QUESTIONS");
  });

  it("calibrates SO-LS-004 as low and keeps its explicit-risk pair elevated", () => {
    expect(runHardRiskGuard("SO-LS-004：不知道说什么，脑子空").level).toBe("low");
    expect(runHardRiskGuard("SO-LS-004-R：不知道说什么，我真的撑不住了").level).toBe("elevated");
  });

  it.each([
    ["说不上来", "说不上来，直接给我一个动作", "action"],
    ["脑子空", "脑子空，但也许可以理小一点", "readiness"],
    ["不知道怎么说", "不知道怎么说，先别问", "boundary"],
    ["就是很乱", "就是很乱，我真的撑不住了", "safety"],
    ["卡住了", "卡住了，帮我拆一个最小动作", "action"],
    ["没接上电", "没接上电，如果只理范围也行", "readiness"],
    ["说不上来", "说不上来，不想整理", "boundary"],
    ["脑子空", "脑子空，我真的撑不住了", "safety"],
  ] as const)("minimal pair changes only the intended priority: %s / %s", (base, changed, kind) => {
    const route = (text: string) => chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 0, companionLockTurns: 0, riskLevel: runHardRiskGuard(text).level, state, signals: extractFallbackSignals(text) }).plan;
    const before = route(base);
    const after = route(changed);
    expect(after.routeReasonCodes).not.toEqual(before.routeReasonCodes);
    if (kind === "action") expect(after.allowActionDraft).toBe(true);
    if (kind === "boundary") expect(after.forbiddenContent).toContain("提问");
    if (kind === "safety" && /撑不住/u.test(changed)) expect(after.routeReasonCodes).toContain("ELEVATED_RISK");
  });
});
