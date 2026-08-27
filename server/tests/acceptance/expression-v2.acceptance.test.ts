import { describe, expect, it } from "vitest";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { DEFAULT_GUIDANCE_STATE } from "../../src/modules/support/guidance-state.js";
import { expressionDeepPlan as deepPlan, expressionV2FrozenCases as cases } from "../../src/evals/datasets/experience-frozen.js";
const emotion = { valence: -0.2, arousal: 0.3, stressLoad: 0.35, cognitiveOverload: 0.3, supportNeed: 0.4, confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString() };

describe("expression v2 frozen acceptance set", () => {
  it("contains 30 comparison cases with the target aggregate distribution", () => {
    expect(cases).toHaveLength(30);
    const accents = cases.map(({ text, plan, expected }) => {
      const actual = resolveResponseStyle({ plan, state: emotion, recentContext: [], userText: text, riskLevel: "low", guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex: 10 }, expressionV2Enabled: true }).profile.expressiveAccent;
      expect(actual).toBe(expected);
      return actual;
    });
    const count = (value: string) => accents.filter((accent) => accent === value).length / accents.length;
    expect(count("none")).toBeGreaterThanOrEqual(0.5);
    expect(count("none")).toBeLessThanOrEqual(0.7);
    expect(count("metaphor")).toBeGreaterThanOrEqual(0.15);
    expect(count("metaphor")).toBeLessThanOrEqual(0.3);
    expect(count("aphorism")).toBeGreaterThanOrEqual(0.05);
    expect(count("aphorism")).toBeLessThanOrEqual(0.15);
    expect(count("dry_humor")).toBeLessThanOrEqual(0.1);
  });

  it.each(Array.from({ length: 10 }, (_, index) => index + 1))("multi-turn cooldown case %s", (offset) => {
    const turnIndex = 20 + offset;
    const style = resolveResponseStyle({
      plan: deepPlan, state: emotion, recentContext: [], userText: "脑子里还是很乱", riskLevel: "low",
      guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex, lastMetaphorTurn: turnIndex - (offset % 3 + 1) }, expressionV2Enabled: true,
    });
    const distance = offset % 3 + 1;
    expect(style.profile.expressiveAccent).toBe(distance >= 3 ? "metaphor" : "none");
    if (distance < 3) expect(style.reasonCodes).toContain("ACCENT_GENERIC_COOLDOWN");
  });

  it("forces restrained compact no-accent output for elevated risk", () => {
    const style = resolveResponseStyle({ plan: deepPlan, state: emotion, recentContext: [], userText: "我一边想说一边很绝望", riskLevel: "elevated", expressionV2Enabled: true });
    expect(style.profile).toMatchObject({ conversationality: "restrained", sentenceRhythm: "compact", expressiveAccent: "none" });
  });
});
