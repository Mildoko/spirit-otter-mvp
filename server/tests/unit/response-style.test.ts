import { describe, expect, it } from "vitest";
import type { EmotionState, ResponsePlan } from "@otter/shared";
import { detectRecentPatterns, resolveResponseStyle, responseStyleResolutionSchema } from "../../src/modules/character/response-style.js";
import { DEFAULT_GUIDANCE_STATE } from "../../src/modules/support/guidance-state.js";

const basePlan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["DEFAULT_COMPANION"], lockTurnsRemaining: 0,
  allowedContent: ["具体承接"], forbiddenContent: ["建议", "行动"],
};
const state = (values: Partial<EmotionState> = {}): EmotionState => ({
  valence: -0.2, arousal: 0.3, stressLoad: 0.4, cognitiveOverload: 0.3, supportNeed: 0.4,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(), ...values,
});

const matrix = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  plan: {
    ...basePlan,
    activeSpirit: index % 2 ? "shore_pick" as const : "deep_tide" as const,
    transitionStyle: index % 5 === 1 ? "blend_to_shore" as const : index % 5 === 2 ? "blend_to_deep" as const : "steady" as const,
    allowActionDraft: index % 2 === 1 && index % 5 !== 1 && index % 5 !== 2,
    forbiddenContent: index % 2 ? [] : ["建议", "行动"],
  },
  state: state({
    arousal: index % 8 === 0 ? 0.8 : 0.3,
    cognitiveOverload: index % 7 === 0 ? 0.7 : 0.3,
    supportNeed: index % 6 === 0 ? 0.7 : 0.4,
    stressLoad: index % 9 === 0 ? 0.7 : 0.4,
    confidence: index % 10 === 0 ? 0.54 : 0.8,
  }),
}));

describe("response style resolver frozen matrix", () => {
  it.each(matrix)("S$id resolves a valid and bounded profile", ({ plan, state: emotion }) => {
    const result = resolveResponseStyle({ plan, state: emotion, recentContext: [], userText: "测试输入", riskLevel: "low" });
    expect(responseStyleResolutionSchema.safeParse(result).success).toBe(true);
    expect(result.profile.questionBudget).toBeLessThanOrEqual(1);
    if (!plan.allowActionDraft) expect(result.profile.adviceDirectness).toBe("none");
    if (emotion.arousal >= 0.8) expect(result.profile).toMatchObject({ pace: "very_slow", questionBudget: 0, expressiveAccent: "none", conversationality: "restrained" });
    if (emotion.confidence < 0.55) expect(result.profile).toMatchObject({ uncertainty: "high", reflectionDepth: "fact" });
    if (plan.transitionStyle === "blend_to_deep") expect(result.profile.adviceDirectness).toBe("none");
  });

  it("reduces repeated questions and water imagery from the last three assistant replies", () => {
    const recentContext = [
      "assistant: 先让它在水面停一下。你愿意说说吗？",
      "user: 还是很乱",
      "assistant: 潮水似乎还没退。最难的是哪里？",
    ];
    expect(detectRecentPatterns(recentContext)).toEqual(expect.arrayContaining(["连续比喻", "连续提问"]));
    const result = resolveResponseStyle({ plan: basePlan, state: state(), recentContext, userText: "我还想说一点", riskLevel: "low" });
    expect(result.profile.expressiveAccent).toBe("none");
    expect(result.profile.questionBudget).toBe(0);
  });

  it("gives explicit user language boundaries priority", () => {
    const result = resolveResponseStyle({
      plan: { ...basePlan, activeSpirit: "shore_pick", allowActionDraft: true, forbiddenContent: [] },
      state: state(), recentContext: [], riskLevel: "low", userText: "请直接说，别问问题，也不要给建议或用潮汐比喻",
    });
    expect(result.profile).toMatchObject({ questionBudget: 0, adviceDirectness: "none", expressiveAccent: "none" });
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["USER_BOUNDARY_NO_QUESTION", "USER_BOUNDARY_NO_ADVICE", "USER_BOUNDARY_NO_ACCENT"]));
  });

  it("selects one semantic accent and honors generic and per-type cooldowns", () => {
    const metaphor = resolveResponseStyle({ plan: basePlan, state: state(), recentContext: [], userText: "脑子里很乱，像都堵住了", riskLevel: "low", guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex: 6 } });
    expect(metaphor.profile.expressiveAccent).toBe("metaphor");
    const cooling = resolveResponseStyle({ plan: basePlan, state: state(), recentContext: [], userText: "脑子还是很乱", riskLevel: "low", guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex: 7, lastAphorismTurn: 6 } });
    expect(cooling.profile.expressiveAccent).toBe("none");
    expect(cooling.reasonCodes).toContain("ACCENT_GENERIC_COOLDOWN");
  });
});
