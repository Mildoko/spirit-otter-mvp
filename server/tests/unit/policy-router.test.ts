import { describe, expect, it } from "vitest";
import { chooseResponsePlan, detectConversationIntent, type PolicyInput } from "../../src/modules/support/policy-router.js";
import type { EmotionState, RawSignals } from "@otter/shared";
import { DEFAULT_GUIDANCE_STATE } from "../../src/modules/support/guidance-state.js";

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
  expressionClarityScore: 0.7,
  progressReadinessScore: 0.25,
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
    expect(detectConversationIntent("你帮我拆一个最小动作就行").directActionRequest).toBe(true);
    expect(detectConversationIntent("如果只是帮我缩成一步也行").tentativeOrganize).toBe(true);
    expect(detectConversationIntent("你要是能帮我捞个最小开始也行").tentativeOrganize).toBe(true);
    expect(detectConversationIntent("别让我做计划，只给我一个真的能开始的动作").directActionRequest).toBe(true);
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

  it("drafts immediately only for a direct request for one small action", () => {
    const direct = chooseResponsePlan(input({ text: "你帮我拆一个最小动作就行" }));
    expect(direct.plan.activeSpirit).toBe("shore_pick");
    expect(direct.plan.allowActionDraft).toBe(true);
    expect(direct.plan.routeReasonCodes).toContain("DIRECT_ACTION_REQUEST");

    const tentative = chooseResponsePlan(input({ text: "如果只是帮我缩成一步，可能会好一点" }));
    expect(tentative.plan.transitionStyle).toBe("blend_to_shore");
    expect(tentative.plan.allowActionDraft).toBe(false);
    expect(tentative.plan.primaryStrategy).toBe("invite_one_small_action");
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

  it("routes low clarity deterministically without authorizing an action", () => {
    const low = { ...signals, expressionClarityScore: 0.2, progressReadinessScore: 0.2 };
    const clarify = chooseResponsePlan(input({ text: "说不上来", signals: low }));
    const weak = chooseResponsePlan(input({ text: "说不上来，但也许可以试试", signals: { ...low, progressReadinessScore: 0.55 } }));
    const stopped = chooseResponsePlan(input({ text: "还是不知道", signals: low, guidanceState: { ...DEFAULT_GUIDANCE_STATE, clarifyAttemptCount: 2 } }));
    expect(clarify.plan.primaryStrategy).toBe("clarify_low_signal");
    expect(weak.plan.primaryStrategy).toBe("clarify_then_invite");
    expect(stopped.plan.primaryStrategy).toBe("pause_low_signal");
    expect([clarify, weak, stopped].every((item) => !item.plan.allowActionDraft)).toBe(true);
  });

  it("accepts a short acknowledgement only for the immediately pending invitation", () => {
    const pending = { ...DEFAULT_GUIDANCE_STATE, turnIndex: 3, transitionInvitePending: true, lastTransitionInviteTurn: 3 };
    expect(detectConversationIntent("好", pending).acceptedTransition).toBe(true);
    expect(detectConversationIntent("先写汇报标题", pending).acceptedTransition).toBe(true);
    expect(detectConversationIntent("好", { ...pending, lastTransitionInviteTurn: 2 }).acceptedTransition).toBe(false);
    expect(chooseResponsePlan(input({ text: "好", guidanceState: pending })).plan.routeReasonCodes).toContain("TRANSITION_ACCEPTED");
    const expired = chooseResponsePlan(input({ text: "先等等，我再说一件别的事", currentSpirit: "shore_pick", spiritTurnCount: 1, guidanceState: pending }));
    expect(expired.plan.routeReasonCodes).toContain("TRANSITION_INVITE_EXPIRED");
    expect(expired.plan.allowActionDraft).toBe(false);
  });

  it("keeps a no-question boundary until explicit reauthorization", () => {
    const bounded = { ...DEFAULT_GUIDANCE_STATE, userRequestedNoQuestions: true };
    expect(chooseResponsePlan(input({ text: "我继续说", guidanceState: bounded })).plan.routeReasonCodes).toContain("USER_REQUESTED_NO_QUESTIONS");
    expect(detectConversationIntent("现在可以问了", bounded).allowQuestions).toBe(true);
  });
});
