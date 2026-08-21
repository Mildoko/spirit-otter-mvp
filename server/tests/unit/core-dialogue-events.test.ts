import { describe, expect, it } from "vitest";
import type { SupportOrchestrator } from "../../src/modules/support/orchestrator.js";
import {
  CORE_DIALOGUE_EVENT_VERSION,
  coreDialogueMinimumEventNames,
  parseCoreDialogueEventMetadata,
  transitionFacts,
} from "../../src/events/core-dialogue-events.js";
import { auditCoreDialogueEvents } from "../../src/events/core-dialogue-event-audit.js";
import { buildCompletedTurnEvents, buildUserTurnSubmittedEvent } from "../../src/events/turn-events.js";

type OrchestratorResult = Awaited<ReturnType<SupportOrchestrator["run"]>>;

function ordinaryResult(): OrchestratorResult {
  return {
    riskLevel: "low",
    ruleCodes: [],
    signalSource: "local_fallback",
    responseSource: "local_fallback",
    reply: "如果你愿意，我们可以只整理一个很小的范围；也可以先不整理。",
    actionDraft: null,
    skillResolution: {
      status: "inactive", skillId: null, skillVersion: null, interactionMode: "core_support", capability: null,
      activationSource: "none", confidence: 0, reasonCodes: ["SKILL_DISABLED"], promptContext: null, suppressMemory: false,
    },
    skillDiagnostics: {
      harnessVersion: "skill-harness-v1", skillId: null, skillVersion: null, status: "inactive", capability: null,
      activationSource: "none", reasonCodes: ["SKILL_DISABLED"], violationCodes: [],
    },
    plan: {
      activeSpirit: "shore_pick",
      supportMode: "clarify",
      sceneState: "near_surface_transition",
      primaryStrategy: "invite_one_small_action",
      transitionStyle: "blend_to_shore",
      allowActionDraft: false,
      routeReasonCodes: ["USER_REQUESTED_ORGANIZE"],
    },
  } as unknown as OrchestratorResult;
}

describe("Core Dialogue Event v2 contract", () => {
  it("defines the 13-event minimum set with explicit follow-up state labels", () => {
    expect(CORE_DIALOGUE_EVENT_VERSION).toBe("event-v2");
    expect(coreDialogueMinimumEventNames).toHaveLength(13);
    expect(coreDialogueMinimumEventNames).toContain("followup_state_labeled");
    expect(() => parseCoreDialogueEventMetadata("followup_state_labeled", {
      sessionId: "session_1", conversationId: "conversation_1", followupId: "followup_1",
      previousState: "not_started", state: "partial_progress", revision: 1, labelSource: "ui_select", transitionValid: true,
    })).not.toThrow();
  });

  it("rejects unknown fields and content-shaped IDs", () => {
    const event = buildUserTurnSubmittedEvent({
      sessionId: "session_1", conversationId: "conversation_1", turnId: "turn_1",
      messageLength: 20, hasFollowupContext: false, hasConfirmedActionContext: false,
    });
    expect(() => parseCoreDialogueEventMetadata(event.eventName, { ...event.metadata, userText: "完整用户原文" })).toThrow();
    expect(() => parseCoreDialogueEventMetadata(event.eventName, { ...event.metadata, turnId: "这是用户完整输入" })).toThrow();
  });

  it("projects structural transition facts without storing reply text", () => {
    const events = buildCompletedTurnEvents({
      sessionId: "session_1", conversationId: "conversation_1", turnId: "turn_1",
      result: ordinaryResult(), durationMs: 10,
    });
    expect(events.map((event) => event.eventName)).toEqual(expect.arrayContaining([
      "risk_assessed", "transition_eligibility_evaluated", "support_turn_completed", "transition_invited",
      "topic_skill_evaluated",
    ]));
    for (const event of events) {
      expect(() => parseCoreDialogueEventMetadata(event.eventName, event.metadata)).not.toThrow();
      expect(JSON.stringify(event.metadata)).not.toContain(ordinaryResult().reply);
    }
  });

  it("records skill diagnostics without birth data or conversation text", () => {
    const result = ordinaryResult();
    result.skillResolution = {
      status: "active", skillId: "astrology", skillVersion: "astrology-skill-v1", interactionMode: "casual_topic",
      capability: "sun_sign_lookup", activationSource: "explicit_request", confidence: 0.98,
      reasonCodes: ["ASTROLOGY_EXPLICIT_REQUEST"], promptContext: "private prompt context", suppressMemory: true,
    };
    result.skillDiagnostics = {
      harnessVersion: "skill-harness-v1", skillId: "astrology", skillVersion: "astrology-skill-v1", status: "active",
      capability: "sun_sign_lookup", activationSource: "explicit_request", reasonCodes: ["ASTROLOGY_EXPLICIT_REQUEST"], violationCodes: [],
    };
    const events = buildCompletedTurnEvents({ sessionId: "session_1", conversationId: "conversation_1", turnId: "turn_1", result, durationMs: 10 });
    const skillEvents = events.filter((event) => event.eventName.startsWith("topic_skill_"));
    expect(skillEvents.map((event) => event.eventName)).toContain("topic_skill_activated");
    for (const event of skillEvents) {
      expect(() => parseCoreDialogueEventMetadata(event.eventName, event.metadata)).not.toThrow();
      expect(JSON.stringify(event.metadata)).not.toMatch(/9月5日|private prompt context|完整用户原文/u);
    }
  });

  it("distinguishes one low-pressure invitation from repeated pressure", () => {
    const single = transitionFacts({
      primaryStrategy: "invite_one_small_action", routeReasonCodes: [], riskLevel: "low", activeSpirit: "deep_tide",
      reply: "如果你愿意，可以只整理一步；也可以先不整理。",
    });
    expect(single).toMatchObject({ invited: true, invitationCount: 1, scopeExplained: true });
  });
});

describe("Core Dialogue Event audit", () => {
  it("excludes legacy rows and fails duplicate or invalid current events", () => {
    const validMetadata = buildUserTurnSubmittedEvent({
      sessionId: "session_1", conversationId: "conversation_1", turnId: "turn_1",
      messageLength: 10, hasFollowupContext: false, hasConfirmedActionContext: false,
    }).metadata;
    const report = auditCoreDialogueEvents([
      { id: "legacy", eventKey: null, eventType: "turn_completed", eventVersion: "legacy-v0", metadataJson: null, occurredAt: new Date(), isReplay: false },
      { id: "one", eventKey: "turn:turn_1:user_turn_submitted", eventType: "user_turn_submitted", eventVersion: CORE_DIALOGUE_EVENT_VERSION, metadataJson: validMetadata, occurredAt: new Date(), isReplay: false },
      { id: "two", eventKey: "turn:turn_1:user_turn_submitted", eventType: "user_turn_submitted", eventVersion: CORE_DIALOGUE_EVENT_VERSION, metadataJson: { ...validMetadata, userText: "不应记录" }, occurredAt: new Date(), isReplay: false },
    ]);
    expect(report.legacyRows).toBe(1);
    expect(report.duplicateEventKeys).toEqual(["turn:turn_1:user_turn_submitted"]);
    expect(report.invalidEvents).toHaveLength(1);
    expect(report.status).toBe("failed");
  });
});
