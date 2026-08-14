import { describe, expect, it } from "vitest";
import { chooseResponsePlan, detectConversationIntent, type PolicyInput } from "../../src/modules/support/policy-router.js";
import type { EmotionState, RawSignals } from "@otter/shared";

const calm: EmotionState = {
  valence: -0.2,
  arousal: 0.3,
  stressLoad: 0.65,
  cognitiveOverload: 0.5,
  supportNeed: 0.45,
  confidence: 0.8,
  evidenceSpans: [],
  validUntil: new Date(Date.now() + 1000).toISOString(),
};
const signals: RawSignals = {
  sentimentPolarity: -0.2,
  urgencyScore: 0.2,
  helplessnessScore: 0.3,
  overloadCueScore: 0.5,
  taskPressureScore: 0.4,
  supportSeekingScore: 0.45,
  evidenceSpans: [],
  confidence: 0.8,
  modelRiskHint: "low",
};

function input(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    text: "今天有些累",
    currentSpirit: "deep_tide",
    spiritTurnCount: 0,
    companionLockTurns: 0,
    riskLevel: "low",
    state: calm,
    signals,
    ...overrides,
  };
}

describe("automatic two-spirit policy router", () => {
  it("uses plain safety output for acute risk", () => {
    const result = chooseResponsePlan(input({ currentSpirit: "shore_pick", riskLevel: "high" }));
    expect(result.plan.sceneState).toBe("safety_plain");
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(result.plan.allowActionDraft).toBe(false);
    expect(result.plan.forbiddenContent).toContain("水域隐喻");
  });

  it("recognizes natural language boundaries and negation", () => {
    expect(detectConversationIntent("先别给建议，只听我说").refuseAdvice).toBe(true);
    expect(detectConversationIntent("帮我理一下下一步怎么办").requestOrganize).toBe(true);
    expect(detectConversationIntent("手上的事情太多，我想先理出一个入口。").requestOrganize).toBe(true);
    expect(detectConversationIntent("并不需要你帮我整理").requestOrganize).toBe(false);
  });

  it("locks deep tide for two turns after advice refusal", () => {
    const refused = chooseResponsePlan(input({ text: "先别给建议，只听我说", currentSpirit: "shore_pick" }));
    expect(refused.plan.activeSpirit).toBe("deep_tide");
    expect(refused.nextCompanionLockTurns).toBe(2);
    const locked = chooseResponsePlan(input({ companionLockTurns: 2, spiritTurnCount: 1, text: "我还想继续说" }));
    expect(locked.plan.routeReasonCodes).toContain("COMPANION_LOCK");
    expect(locked.nextCompanionLockTurns).toBe(1);
  });

  it("blends to shore on an explicit organization request without drafting immediately", () => {
    const result = chooseResponsePlan(input({ text: "帮我理一下下一步怎么办" }));
    expect(result.plan.activeSpirit).toBe("shore_pick");
    expect(result.plan.transitionStyle).toBe("blend_to_shore");
    expect(result.plan.allowActionDraft).toBe(false);
  });

  it("holds shore for at least two turns and then permits one action", () => {
    const result = chooseResponsePlan(input({ currentSpirit: "shore_pick", spiritTurnCount: 1, text: "先写汇报标题" }));
    expect(result.plan.activeSpirit).toBe("shore_pick");
    expect(result.plan.allowActionDraft).toBe(true);
    expect(result.plan.routeReasonCodes).toContain("SHORE_MIN_TURNS");
  });

  it("returns to deep tide when arousal rises", () => {
    const result = chooseResponsePlan(input({
      currentSpirit: "shore_pick",
      spiritTurnCount: 2,
      previousArousal: 0.3,
      state: { ...calm, arousal: 0.5 },
    }));
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(result.plan.routeReasonCodes).toContain("AROUSAL_RISE");
  });
});
