import { describe, expect, it } from "vitest";
import { getShortestPaths } from "xstate/graph";
import type { RawSignals, ResponsePlan } from "@otter/shared";
import { createDefaultGuidanceState, type AdvanceGuidanceStateInput } from "../../src/modules/support/guidance-state.js";
import { createActionMachine, parseActionMachineEvent, transitionActionXState } from "../../src/state-machines/action-machine.js";
import { parseGuidanceMachineEvent } from "../../src/state-machines/guidance-machine.js";
import { resolveGuidanceTransition } from "../../src/state-machines/guidance-transition.js";
import { assertFollowupCreation, createFollowupMachine, parseFollowupMachineEvent, transitionFollowupXState } from "../../src/state-machines/followup-machine.js";

const signals: RawSignals = {
  sentimentPolarity: 0,
  urgencyScore: 0.2,
  helplessnessScore: 0.2,
  overloadCueScore: 0.2,
  taskPressureScore: 0.2,
  supportSeekingScore: 0.4,
  expressionClarityScore: 0.2,
  progressReadinessScore: 0.2,
  evidenceSpans: [],
  confidence: 0.7,
  modelRiskHint: "low",
  ruleCodes: ["TEST"],
};
const plan: ResponsePlan = {
  activeSpirit: "deep_tide",
  transitionStyle: "steady",
  supportMode: "clarify",
  sceneState: "quiet_water",
  primaryStrategy: "clarify_low_signal",
  allowActionDraft: false,
  routeReasonCodes: [],
  lockTurnsRemaining: 0,
  allowedContent: [],
  forbiddenContent: [],
};
const transition = (): AdvanceGuidanceStateInput => ({
  previous: { ...createDefaultGuidanceState(), healing: { ...createDefaultGuidanceState().healing, segmentId: "segment-base" } },
  intent: {
    acceptedTransition: false,
    declinedTransition: false,
    requestNoQuestions: false,
    allowQuestions: false,
    directActionRequest: false,
    requestTopicLead: false,
    lowSignalTopicCue: false,
    requestTopicSwitch: false,
    requestTopicStop: false,
  },
  signals,
  plan,
  deliveredAccent: "none",
  now: new Date("2026-08-27T00:00:00.000Z"),
  segmentIdFactory: () => "segment-fixed",
});

describe("P1 XState contracts", () => {
  it("rejects unknown structured events", () => {
    expect(() => parseActionMachineEvent({ type: "FORCE" })).toThrow();
    expect(() => parseFollowupMachineEvent({ type: "REOPEN" })).toThrow();
    expect(() => parseGuidanceMachineEvent({ type: "UNKNOWN" })).toThrow();
    expect(() => parseGuidanceMachineEvent({ type: "ADVANCE", input: { userText: "不应进入状态机" } })).toThrow();
  });

  it("keeps guidance shadow and new output identical to the frozen reducer", () => {
    const shadow = resolveGuidanceTransition({ mode: "shadow", transition: transition() });
    const authority = resolveGuidanceTransition({ mode: "new", transition: transition() });
    expect(shadow.parity).toBe("match");
    expect(authority.parity).toBe("match");
    expect(authority.state).toEqual(shadow.state);
  });

  it("covers every action status with shortest paths and rejects illegal draft edges", () => {
    const paths = getShortestPaths(createActionMachine("draft"));
    const states = new Set(paths.map((path) => path.state.value));
    expect(states).toEqual(new Set(["draft", "confirmed", "completed", "deferred", "deleted"]));
    expect(transitionActionXState("draft", { type: "COMPLETE" })).toEqual({ status: "draft", accepted: false });
    expect(transitionActionXState("draft", { type: "CONFIRM" })).toEqual({ status: "confirmed", accepted: true });
  });

  it("enforces follow-up authorization, terminal outcomes, and lifecycle paths", () => {
    expect(() => assertFollowupCreation({ authorized: false, actionStatus: "confirmed" })).toThrowError(/明确授权/u);
    expect(() => assertFollowupCreation({ authorized: true, actionStatus: "draft" })).toThrowError(/已确认/u);
    expect(() => assertFollowupCreation({ authorized: true, actionStatus: "confirmed" })).not.toThrow();
    const paths = getShortestPaths(createFollowupMachine("pending"));
    expect(new Set(paths.map((path) => path.state.value))).toEqual(new Set(["pending", "completed", "deferred", "closed", "deleted"]));
    expect(transitionFollowupXState({
      status: "completed", outcomeState: "completed", outcomeLabeled: true,
      event: { type: "LABEL_OUTCOME", state: "blocked" },
    }).accepted).toBe(false);
    expect(transitionFollowupXState({
      status: "closed", outcomeState: "blocked", outcomeLabeled: true,
      event: { type: "LABEL_OUTCOME", state: "blocked" },
    }).accepted).toBe(false);
  });
});
