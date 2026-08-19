import { describe, expect, it } from "vitest";
import type { EmotionState, ResponsePlan } from "@otter/shared";
import { validateGeneratedReply } from "../../src/modules/character/reply-validator.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { fallbackReply } from "../../src/modules/support/static-responses.js";

const plan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0,
  allowedContent: ["承接"], forbiddenContent: ["建议", "行动"],
};
const state: EmotionState = {
  valence: -0.4, arousal: 0.3, stressLoad: 0.5, cognitiveOverload: 0.3, supportNeed: 0.5,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(),
};
const style = resolveResponseStyle({ plan, state, recentContext: [], userText: "工作让我很难受", riskLevel: "low" });

describe("generated reply validator", () => {
  it("accepts a concrete, bounded deep-tide reply", () => {
    const result = validateGeneratedReply({ reply: "工作被否定以后，那股难受似乎还压在这里。先不急着把它变成办法。", actionDraft: null, plan, style, userText: "工作被否定让我很难受", recentContext: [] });
    expect(result).toEqual({ ok: true, hardValid: true, violations: [] });
  });

  it.each([
    ["保持积极，一切都会好。你只需要振作。", "BANNED_PHRASE"],
    ["只有我懂你。不要联系别人。", "DEPENDENCY_LANGUAGE"],
    ["你患有抑郁症。这个判断很明确。", "DIAGNOSIS_LANGUAGE"],
    ["建议你先列步骤。然后马上执行。", "DEEP_TIDE_DIRECT_ADVICE"],
  ])("rejects hard violation %s", (reply, code) => {
    const result = validateGeneratedReply({ reply, actionDraft: null, plan, style, userText: "工作让我很难受", recentContext: [] });
    expect(result.hardValid).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain(code);
  });

  it("marks repetition and missing anchoring as soft violations", () => {
    const result = validateGeneratedReply({
      reply: "先让这句话落在这里。它似乎还有一些分量。", actionDraft: null, plan, style,
      userText: "客户在会议上否定了方案", recentContext: ["assistant: 先让这句话落在这里。我不急着解释。"],
    });
    expect(result.hardValid).toBe(true);
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["REPEATED_OPENING", "MISSING_CONCRETE_ANCHOR"]));
  });

  it("does not echo a banned phrase from the user in local fallback", () => {
    const result = fallbackReply({ plan, style, state, userText: "不要跟我说一切都会好，我听不进去", recentContext: [] });
    expect(result.reply).not.toContain("一切都会好");
    expect(result.reply).toContain("套话");
  });

  it("does not echo a user metaphor when the resolved accent is none", () => {
    const noAccent = { ...style, profile: { ...style.profile, expressiveAccent: "none" as const } };
    const result = fallbackReply({ plan, style: noAccent, state, userText: "别再说让我停在水面，我不喜欢", recentContext: [] });
    expect(result.reply).not.toContain("水面");
    expect(validateGeneratedReply({ reply: result.reply, actionDraft: null, plan, style: noAccent, userText: "别再说让我停在水面，我不喜欢", recentContext: [] }).hardValid).toBe(true);
  });

  it("allows deep tide to acknowledge steps while stopping advice", () => {
    const result = validateGeneratedReply({
      reply: "这些步骤没有让你轻一点，反而又添了一层压力。那就先把步骤收起来，我不继续往前推。",
      actionDraft: null, plan, style, userText: "这些步骤让我更烦了", recentContext: [],
    });
    expect(result.hardValid).toBe(true);
    expect(result.violations.map((item) => item.code)).not.toContain("DEEP_TIDE_DIRECT_ADVICE");
  });

  it("requires a direct answer when the user explicitly asks for advice", () => {
    const advicePlan = { ...plan, primaryStrategy: "answer_requested_advice", routeReasonCodes: ["USER_REQUESTED_ADVICE"] };
    const adviceStyle = resolveResponseStyle({ plan: advicePlan, state, recentContext: [], userText: "你有什么建议", riskLevel: "low" });
    const deferred = validateGeneratedReply({
      reply: "先让这句话停在这里。我不把它翻译成办法。",
      actionDraft: null, plan: advicePlan, style: adviceStyle, userText: "你有什么建议", recentContext: [],
    });
    expect(deferred.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["REQUESTED_ADVICE_MISSING", "REQUESTED_ADVICE_DEFERRED"]));

    const answered = validateGeneratedReply({
      reply: "你一边很在意，一边又拿不准，这种悬着确实磨人。我的建议是先看对方实际的回应，别让猜测替现实作答。",
      actionDraft: null, plan: advicePlan, style: adviceStyle, userText: "你有什么建议", recentContext: [],
    });
    expect(answered.hardValid).toBe(true);
    expect(answered.violations.map((item) => item.code)).not.toContain("DEEP_TIDE_DIRECT_ADVICE");
  });

  it("uses recent conversation context in the advice fallback instead of repeating the request", () => {
    const advicePlan = { ...plan, primaryStrategy: "answer_requested_advice", routeReasonCodes: ["USER_REQUESTED_ADVICE"] };
    const adviceStyle = resolveResponseStyle({ plan: advicePlan, state, recentContext: [], userText: "你有什么建议", riskLevel: "low" });
    const result = fallbackReply({
      plan: advicePlan,
      style: adviceStyle,
      state,
      userText: "你有什么建议",
      recentContext: ["user: 我不确定她对我的感受，可能有点信任，但我一直在猜", "assistant: 听起来这份不确定让你很悬。"],
    });
    expect(result.reply).toContain("我不确定她对我的感受");
    expect(result.reply).toContain("我的建议是");
    expect(result.reply).not.toContain("我不把它翻译成办法");
    expect(validateGeneratedReply({ reply: result.reply, actionDraft: null, plan: advicePlan, style: adviceStyle, userText: "你有什么建议", recentContext: [] }).hardValid).toBe(true);
  });

  it("rejects concrete actions before a tentative transition is accepted", () => {
    const transitionPlan = { ...plan, activeSpirit: "shore_pick" as const, transitionStyle: "blend_to_shore" as const, sceneState: "near_surface_transition" as const, primaryStrategy: "invite_one_small_action" };
    const result = validateGeneratedReply({
      reply: "如果你愿意，我们可以整理一下。先打开邮件，写一句开头。",
      actionDraft: null, plan: transitionPlan, style, userText: "如果只是帮我缩成一步也行", recentContext: [],
    });
    expect(result.violations.map((item) => item.code)).toContain("ACTION_BEFORE_ACCEPTANCE");
  });

  it("accepts a low-pressure transition invitation without a concrete action", () => {
    const transitionPlan = { ...plan, activeSpirit: "shore_pick" as const, transitionStyle: "blend_to_shore" as const, sceneState: "near_surface_transition" as const, primaryStrategy: "invite_one_small_action" };
    const result = validateGeneratedReply({
      reply: "你已经有一点想往前挪的愿望。如果你愿意，我可以陪你把范围整理得很小；也可以先不整理。",
      actionDraft: null, plan: transitionPlan, style, userText: "如果只是帮我缩成一步也行", recentContext: [],
    });
    expect(result.hardValid).toBe(true);
  });

  it("requires a light safety check for elevated risk", () => {
    const elevatedPlan = { ...plan, supportMode: "stabilize" as const, routeReasonCodes: ["ELEVATED_RISK"] };
    const missing = validateGeneratedReply({ reply: "我听见这件事很重，先让它停在这里。", actionDraft: null, plan: elevatedPlan, style, userText: "我快撑不住了", recentContext: [] });
    expect(missing.violations.map((item) => item.code)).toContain("ELEVATED_SAFETY_CHECK_MISSING");
    const present = validateGeneratedReply({ reply: "我听见这件事很重。你现在安全吗，身边有没有可以联系的人？", actionDraft: null, plan: elevatedPlan, style, userText: "我快撑不住了", recentContext: [] });
    expect(present.violations.map((item) => item.code)).not.toContain("ELEVATED_SAFETY_CHECK_MISSING");
  });

  it("rejects multiple expressive accents and mentor-like aphorisms", () => {
    const accentStyle = { ...style, profile: { ...style.profile, expressiveAccent: "metaphor" as const } };
    const multiple = validateGeneratedReply({
      reply: "这些任务像后台程序同时报警。行动的价值不在大，而在能开始。",
      actionDraft: null, plan, style: accentStyle, userText: "任务都堆着，脑子很乱", recentContext: [],
    });
    expect(multiple.violations.map((item) => item.code)).toContain("MULTIPLE_EXPRESSIVE_ACCENTS");

    const aphorismStyle = { ...style, profile: { ...style.profile, expressiveAccent: "aphorism" as const } };
    const preachy = validateGeneratedReply({
      reply: "人生就是这样。行动的价值不在大，而在能开始。",
      actionDraft: null, plan, style: aphorismStyle, userText: "我一边想做，一边又害怕", recentContext: [],
    });
    expect(preachy.violations.map((item) => item.code)).toContain("UNSUPPORTED_APHORISM");
  });

  it("rejects definite emotion claims when the state is unknown", () => {
    const emotionHypothesis = { schemaVersion: 1 as const, status: "unknown" as const, subject: "unknown" as const, valence: 0, arousal: 0.2, control: 0.5, labels: [], confidence: 0.2 };
    const result = validateGeneratedReply({
      reply: "你现在很愤怒，这就是你的真实情绪。", actionDraft: null, plan, style, emotionHypothesis,
      userText: "说不上来", recentContext: [],
    });
    expect(result.violations.map((item) => item.code)).toContain("UNSUPPORTED_EMOTION_ASSERTION");
  });

  it("does not apply emotion-v2 assertion rules when no hypothesis is supplied", () => {
    const result = validateGeneratedReply({
      reply: "你现在很愤怒，这股火气有它的来处。", actionDraft: null, plan, style,
      userText: "他们这样太过分了", recentContext: [],
    });
    expect(result.violations.map((item) => item.code)).not.toContain("UNSUPPORTED_EMOTION_ASSERTION");
  });

  it("rejects a label that contradicts the user's correction", () => {
    const emotionHypothesis = {
      schemaVersion: 1 as const, status: "user_corrected" as const, subject: "user" as const, valence: -0.4, arousal: 0.3, control: 0.5,
      labels: [{ label: "disappointment" as const, intensity: 0.8, confidence: 1, evidenceSpans: ["用户主动纠正"] }], confidence: 1,
    };
    const result = validateGeneratedReply({
      reply: "你其实很生气，我们先承认这股愤怒。", actionDraft: null, plan, style, emotionHypothesis,
      userText: "我还想说一点", recentContext: [],
    });
    expect(result.violations.map((item) => item.code)).toContain("CONTRADICTS_USER_CORRECTION");
  });
});
