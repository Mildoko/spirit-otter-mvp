import { describe, expect, it } from "vitest";
import type { RawSignals, ResponsePlan } from "@otter/shared";
import { advanceGuidanceState, DEFAULT_GUIDANCE_STATE, parseGuidanceState } from "../../src/modules/support/guidance-state.js";

const signals = (clarity: number, readiness: number): RawSignals => ({
  sentimentPolarity: 0, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.2,
  taskPressureScore: 0.2, supportSeekingScore: 0.4, expressionClarityScore: clarity, progressReadinessScore: readiness,
  evidenceSpans: [], confidence: 0.7, modelRiskHint: "low", ruleCodes: ["TEST"],
});
const plan = (primaryStrategy: string): ResponsePlan => ({
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "clarify", sceneState: "quiet_water",
  primaryStrategy, allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0, allowedContent: [], forbiddenContent: [],
});
const intent = { acceptedTransition: false, declinedTransition: false, requestNoQuestions: false, allowQuestions: false, directActionRequest: false };

describe("GuidanceStateV1", () => {
  it("falls back safely for null, old, and invalid state", () => {
    expect(parseGuidanceState(null)).toEqual(DEFAULT_GUIDANCE_STATE);
    expect(parseGuidanceState({ schemaVersion: 0 })).toEqual(DEFAULT_GUIDANCE_STATE);
    expect(parseGuidanceState({ ...DEFAULT_GUIDANCE_STATE, turnIndex: -1 })).toEqual(DEFAULT_GUIDANCE_STATE);
  });

  it("stops clarification at two attempts and resets after progress", () => {
    const first = advanceGuidanceState({ previous: { ...DEFAULT_GUIDANCE_STATE }, intent, signals: signals(0.2, 0.2), plan: plan("clarify_low_signal"), finalReply: "说一个词就好。", deliveredAccent: "none" });
    const second = advanceGuidanceState({ previous: first, intent, signals: signals(0.2, 0.2), plan: plan("clarify_low_signal"), finalReply: "也可以停一下。", deliveredAccent: "none" });
    const progressed = advanceGuidanceState({ previous: second, intent, signals: signals(0.7, 0.8), plan: plan("invite_one_small_action"), finalReply: "如果愿意，可以整理。", deliveredAccent: "none" });
    expect(first.clarifyAttemptCount).toBe(1);
    expect(second.clarifyAttemptCount).toBe(2);
    expect(progressed.clarifyAttemptCount).toBe(0);
    expect(progressed.transitionInvitePending).toBe(true);
  });

  it("persists question boundaries and records only delivered accents", () => {
    const bounded = advanceGuidanceState({ previous: { ...DEFAULT_GUIDANCE_STATE }, intent: { ...intent, requestNoQuestions: true }, signals: signals(0.6, 0.2), plan: plan("specific_reflection"), finalReply: "我不问。", deliveredAccent: "none" });
    const allowed = advanceGuidanceState({ previous: bounded, intent: { ...intent, allowQuestions: true }, signals: signals(0.6, 0.2), plan: plan("specific_reflection"), finalReply: "可以。", deliveredAccent: "metaphor" });
    expect(bounded.userRequestedNoQuestions).toBe(true);
    expect(bounded.lastMetaphorTurn).toBeNull();
    expect(allowed.userRequestedNoQuestions).toBe(false);
    expect(allowed.lastMetaphorTurn).toBe(2);
  });
});
