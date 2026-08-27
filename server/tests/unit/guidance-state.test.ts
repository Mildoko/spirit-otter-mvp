import { describe, expect, it } from "vitest";
import type { RawSignals, ResponsePlan } from "@otter/shared";
import { advanceGuidanceState, createDefaultGuidanceState, DEFAULT_GUIDANCE_STATE, parseGuidanceState } from "../../src/modules/support/guidance-state.js";

const signals = (clarity: number, readiness: number): RawSignals => ({
  sentimentPolarity: 0, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.2,
  taskPressureScore: 0.2, supportSeekingScore: 0.4, expressionClarityScore: clarity, progressReadinessScore: readiness,
  evidenceSpans: [], confidence: 0.7, modelRiskHint: "low", ruleCodes: ["TEST"],
});
const plan = (primaryStrategy: string): ResponsePlan => ({
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "clarify", sceneState: "quiet_water",
  primaryStrategy, allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0, allowedContent: [], forbiddenContent: [],
});
const intent = {
  acceptedTransition: false, declinedTransition: false, requestNoQuestions: false, allowQuestions: false, directActionRequest: false,
  requestTopicLead: false, lowSignalTopicCue: false, requestTopicSwitch: false, requestTopicStop: false,
};

describe("GuidanceStateV4", () => {
  it("falls back safely for null, old, and invalid state", () => {
    for (const parsed of [parseGuidanceState(null), parseGuidanceState({ schemaVersion: 0 }), parseGuidanceState({ ...DEFAULT_GUIDANCE_STATE, turnIndex: -1 })]) {
      expect(parsed).toMatchObject({ ...DEFAULT_GUIDANCE_STATE, healing: { ...DEFAULT_GUIDANCE_STATE.healing, segmentId: expect.any(String) } });
    }
  });

  it("migrates valid V1 and V2 state without inventing active topic data", () => {
    const legacy = { ...DEFAULT_GUIDANCE_STATE, schemaVersion: 1 as const };
    const { topicSkill: _skill, topicLead: _lead, ...v1 } = legacy;
    const migratedV1 = parseGuidanceState(v1);
    const { topicLead: _v2Lead, ...v2Base } = DEFAULT_GUIDANCE_STATE;
    const migratedV2 = parseGuidanceState({ ...v2Base, schemaVersion: 2 });
    expect(migratedV1.schemaVersion).toBe(4);
    expect(migratedV2.schemaVersion).toBe(4);
    expect(migratedV1.topicSkill).toEqual({ activeSkillId: null, activeVersion: null, lastActivatedTurn: null, suspendedSkillIds: [] });
    expect(migratedV1.topicLead.status).toBe("inactive");
    expect(migratedV2.topicLead.status).toBe("inactive");
    expect(migratedV1.healing.status).toBe("inactive");
  });

  it("returns independent nested arrays for every default state", () => {
    const first = createDefaultGuidanceState();
    const second = createDefaultGuidanceState();
    first.topicLead.recentTopicIds.push("test-topic");
    first.topicSkill.suspendedSkillIds.push("astrology");
    expect(second.topicLead.recentTopicIds).toEqual([]);
    expect(second.topicSkill.suspendedSkillIds).toEqual([]);
  });

  it("stops clarification at two attempts and resets after progress", () => {
    const first = advanceGuidanceState({ previous: { ...DEFAULT_GUIDANCE_STATE }, intent, signals: signals(0.2, 0.2), plan: plan("clarify_low_signal"), deliveredAccent: "none" });
    const second = advanceGuidanceState({ previous: first, intent, signals: signals(0.2, 0.2), plan: plan("clarify_low_signal"), deliveredAccent: "none" });
    const progressed = advanceGuidanceState({ previous: second, intent, signals: signals(0.7, 0.8), plan: plan("invite_one_small_action"), deliveredAccent: "none" });
    expect(first.clarifyAttemptCount).toBe(1);
    expect(second.clarifyAttemptCount).toBe(2);
    expect(progressed.clarifyAttemptCount).toBe(0);
    expect(progressed.transitionInvitePending).toBe(true);
  });

  it("persists question boundaries and records only delivered accents", () => {
    const bounded = advanceGuidanceState({ previous: { ...DEFAULT_GUIDANCE_STATE }, intent: { ...intent, requestNoQuestions: true }, signals: signals(0.6, 0.2), plan: plan("specific_reflection"), deliveredAccent: "none" });
    const allowed = advanceGuidanceState({ previous: bounded, intent: { ...intent, allowQuestions: true }, signals: signals(0.6, 0.2), plan: plan("specific_reflection"), deliveredAccent: "metaphor" });
    expect(bounded.userRequestedNoQuestions).toBe(true);
    expect(bounded.lastMetaphorTurn).toBeNull();
    expect(allowed.userRequestedNoQuestions).toBe(false);
    expect(allowed.lastMetaphorTurn).toBe(2);
  });

  it("starts a fresh short-term healing segment after twenty-four-hour expiry", () => {
    const previous = createDefaultGuidanceState();
    const oldSegment = previous.healing.segmentId;
    previous.healing = { ...previous.healing, status: "repairing", consecutiveMissCount: 2, expiresAt: "2026-08-23T00:00:00.000Z" };
    const next = advanceGuidanceState({
      previous, intent, signals: signals(0.7, 0.2), plan: plan("specific_reflection"), deliveredAccent: "none",
      healingBrief: { schemaVersion: 1, status: "active", goal: "felt_seen", depth: "recognize", insight: null, rupture: "none", realityPressure: "none", allowedMoves: [], forbiddenMoves: [], replyOutline: [] },
      now: new Date("2026-08-24T00:00:01.000Z"),
    });
    expect(next.healing.segmentId).not.toBe(oldSegment);
    expect(next.healing.consecutiveMissCount).toBe(0);
  });
});
