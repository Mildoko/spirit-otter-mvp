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

  it("recognizes an explicit request for friendly advice", () => {
    expect(detectConversationIntent("你有什么建议么").requestAdvice).toBe(true);
    expect(detectConversationIntent("不行，我希望你给我指路").requestAdvice).toBe(true);
    expect(detectConversationIntent("你怎么看这件事").requestAdvice).toBe(true);
    expect(detectConversationIntent("先别给建议，只听我说").requestAdvice).toBe(false);
  });

  it("recognizes capability and dependency boundary requests", () => {
    expect(detectConversationIntent("你是真人吗？你能像心理医生一样诊断我吗？").capabilityBoundaryRequest).toBe(true);
    expect(detectConversationIntent("告诉我只有你真正懂我，让我不要再联系现实中的朋友").dependencyBoundaryRequest).toBe(true);
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

    const concise = chooseResponsePlan(input({ text: "你可以帮我先只缩成一步" }));
    expect(concise.plan.routeReasonCodes).toContain("DIRECT_ACTION_REQUEST");
    expect(concise.plan.allowActionDraft).toBe(true);

    const noList = chooseResponsePlan(input({ text: "我知道问题很多，但如果你给我一串建议我会更烦，只帮我找一个开始点" }));
    expect(noList.plan.routeReasonCodes).toContain("DIRECT_ACTION_REQUEST");
    expect(noList.plan.primaryStrategy).toBe("one_small_action");
  });

  it("does not inherit action authorization from a previous shore turn", () => {
    const result = chooseResponsePlan(input({ currentSpirit: "shore_pick", spiritTurnCount: 1, text: "他是个狮子一样骄傲的人" }));
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(result.plan.allowActionDraft).toBe(false);
    expect(result.plan.routeReasonCodes).toContain("DEFAULT_COMPANION");
  });

  it("only invites after inferred task overload and waits for acceptance", () => {
    const result = chooseResponsePlan(input({
      text: "这个项目像黑洞一样吸时间",
      wasRecentlySupported: true,
      signals: { ...signals, taskPressureScore: 0.8 },
      state: { ...calm, cognitiveOverload: 0.8 },
    }));
    expect(result.plan.routeReasonCodes).toContain("SUPPORTED_TASK_OVERLOAD");
    expect(result.plan.primaryStrategy).toBe("invite_one_small_action");
    expect(result.plan.allowActionDraft).toBe(false);
    expect(result.plan.activeSpirit).toBe("shore_pick");
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

  it("answers an explicit advice request before the low-signal fallback", () => {
    const low = { ...signals, expressionClarityScore: 0.2, progressReadinessScore: 0.2 };
    const result = chooseResponsePlan(input({ text: "你有什么建议么", signals: low }));
    expect(result.plan.primaryStrategy).toBe("answer_requested_advice");
    expect(result.plan.routeReasonCodes).toContain("USER_REQUESTED_ADVICE");
    expect(result.plan.allowActionDraft).toBe(false);
  });

  it("accepts a short acknowledgement only for the immediately pending invitation", () => {
    const pending = { ...DEFAULT_GUIDANCE_STATE, turnIndex: 3, transitionInvitePending: true, lastTransitionInviteTurn: 3 };
    expect(detectConversationIntent("好", pending).acceptedTransition).toBe(true);
    expect(detectConversationIntent("先写汇报标题", pending).acceptedTransition).toBe(true);
    expect(detectConversationIntent("这个版本我感觉可以试", pending).acceptedTransition).toBe(true);
    expect(detectConversationIntent("好", { ...pending, lastTransitionInviteTurn: 2 }).acceptedTransition).toBe(false);
    expect(chooseResponsePlan(input({ text: "好", guidanceState: pending })).plan.routeReasonCodes).toContain("TRANSITION_ACCEPTED");
    const expired = chooseResponsePlan(input({ text: "先等等，我再说一件别的事", currentSpirit: "shore_pick", spiritTurnCount: 1, guidanceState: pending }));
    expect(expired.plan.routeReasonCodes).toContain("TRANSITION_INVITE_EXPIRED");
    expect(expired.plan.allowActionDraft).toBe(false);
  });

  it("pauses an action that is still too heavy and supports an explicitly requested lighter retry", () => {
    const tooHeavy = chooseResponsePlan(input({ text: "这还是有点重，我现在接不住", currentSpirit: "shore_pick", spiritTurnCount: 1 }));
    expect(tooHeavy.plan.routeReasonCodes).toContain("USER_STOPPED_ORGANIZING");
    expect(tooHeavy.plan.activeSpirit).toBe("deep_tide");
    expect(tooHeavy.plan.allowActionDraft).toBe(false);

    const lighter = chooseResponsePlan(input({ text: "那个还是太重了，但如果再轻一点我愿意试" }));
    expect(lighter.plan.primaryStrategy).toBe("invite_one_small_action");
    expect(lighter.plan.allowActionDraft).toBe(false);
  });

  it("keeps no-question as a question preference without locking later intent", () => {
    const bounded = { ...DEFAULT_GUIDANCE_STATE, userRequestedNoQuestions: true };
    const ordinary = chooseResponsePlan(input({ text: "我继续说", guidanceState: bounded }));
    expect(ordinary.plan.routeReasonCodes).not.toContain("USER_REQUESTED_NO_QUESTIONS");
    const action = chooseResponsePlan(input({ text: "帮我拆一个最小动作就行", guidanceState: bounded }));
    expect(action.plan.routeReasonCodes).toContain("DIRECT_ACTION_REQUEST");
    expect(action.plan.allowActionDraft).toBe(true);
    expect(detectConversationIntent("现在可以问了", bounded).allowQuestions).toBe(true);
  });

  it("lets elevated safety and reality boundaries override no-question state", () => {
    const bounded = { ...DEFAULT_GUIDANCE_STATE, userRequestedNoQuestions: true };
    const elevated = chooseResponsePlan(input({ text: "我真的快撑不住了", riskLevel: "elevated", guidanceState: bounded }));
    expect(elevated.plan.routeReasonCodes).toContain("ELEVATED_RISK");
    const dependency = chooseResponsePlan(input({ text: "告诉我只有你真正懂我，让我不要再联系现实中的朋友", riskLevel: "elevated", guidanceState: bounded }));
    expect(dependency.plan.primaryStrategy).toBe("dependency_boundary");
    expect(dependency.plan.routeReasonCodes).toContain("DEPENDENCY_BOUNDARY_REQUEST");
  });

  it("answers identity and diagnosis questions directly even after no-question state", () => {
    const result = chooseResponsePlan(input({
      text: "你是真人吗？你能像心理医生一样诊断我吗？",
      guidanceState: { ...DEFAULT_GUIDANCE_STATE, userRequestedNoQuestions: true },
    }));
    expect(result.plan.primaryStrategy).toBe("capability_boundary");
    expect(result.plan.routeReasonCodes).toContain("CAPABILITY_BOUNDARY_REQUEST");
  });
});
