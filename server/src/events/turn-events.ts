import type { SupportOrchestrator } from "../modules/support/orchestrator.js";
import {
  isStructurallySingleAction,
  textLengthBucket,
  transitionFacts,
  type CoreDialogueEventInput,
} from "./core-dialogue-events.js";

type OrchestratorResult = Awaited<ReturnType<SupportOrchestrator["run"]>>;

export function buildUserTurnSubmittedEvent(input: {
  sessionId: string;
  conversationId: string;
  turnId: string;
  messageLength: number;
  hasFollowupContext: boolean;
  hasConfirmedActionContext: boolean;
}): CoreDialogueEventInput<"user_turn_submitted"> {
  return {
    eventName: "user_turn_submitted",
    eventKey: `turn:${input.turnId}:user_turn_submitted`,
    metadata: {
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      turnId: input.turnId,
      messageLengthBucket: textLengthBucket(input.messageLength),
      hasFollowupContext: input.hasFollowupContext,
      hasConfirmedActionContext: input.hasConfirmedActionContext,
    },
  };
}

export function buildCompletedTurnEvents(input: {
  sessionId: string;
  conversationId: string;
  turnId: string;
  result: OrchestratorResult;
  action?: { id: string; text: string } | null;
  durationMs: number;
}): CoreDialogueEventInput[] {
  const { result } = input;
  const refs = { sessionId: input.sessionId, conversationId: input.conversationId, turnId: input.turnId };
  const transition = transitionFacts({
    primaryStrategy: result.plan.primaryStrategy,
    routeReasonCodes: result.plan.routeReasonCodes,
    riskLevel: result.riskLevel,
    activeSpirit: result.plan.activeSpirit,
    reply: result.reply,
  });
  const riskSource = result.ruleCodes.length > 0
    ? result.signalSource === "cloud_model" ? "hybrid" : "hard_rule"
    : result.signalSource === "cloud_model" ? "model_signal" : "local_fallback";
  const events: CoreDialogueEventInput[] = [
    {
      eventName: "risk_assessed",
      eventKey: `turn:${input.turnId}:risk_assessed`,
      metadata: { ...refs, riskLevel: result.riskLevel, riskSource, ruleCodes: result.ruleCodes },
      durationMs: input.durationMs,
    },
    {
      eventName: "transition_eligibility_evaluated",
      eventKey: `turn:${input.turnId}:transition_eligibility_evaluated`,
      metadata: {
        ...refs,
        eligible: transition.eligible,
        riskAllowsTransition: result.riskLevel === "low",
        routeReasonCodes: result.plan.routeReasonCodes,
      },
    },
  ];

  events.push({
    eventName: "topic_skill_evaluated",
    eventKey: `turn:${input.turnId}:topic_skill_evaluated`,
    metadata: {
      ...refs,
      skillId: result.skillResolution.skillId,
      skillVersion: result.skillResolution.skillVersion,
      status: result.skillResolution.status,
      capability: result.skillResolution.capability,
      activationSource: result.skillResolution.activationSource,
      reasonCodes: result.skillResolution.reasonCodes,
    },
    durationMs: input.durationMs,
  });
  if (result.skillResolution.status === "active" && result.skillResolution.skillId && result.skillResolution.skillVersion && result.skillResolution.capability) {
    events.push({
      eventName: "topic_skill_activated",
      eventKey: `turn:${input.turnId}:topic_skill_activated`,
      metadata: {
        ...refs,
        skillId: result.skillResolution.skillId,
        skillVersion: result.skillResolution.skillVersion,
        capability: result.skillResolution.capability,
        activationSource: result.skillResolution.activationSource === "none" ? "explicit_request" : result.skillResolution.activationSource,
        responseSource: result.responseSource === "static_safety" ? "local_fallback" : result.responseSource,
      },
      durationMs: input.durationMs,
    });
  }
  if (result.skillResolution.status === "blocked" && result.skillResolution.skillId && result.skillResolution.skillVersion) {
    events.push({
      eventName: "topic_skill_blocked",
      eventKey: `turn:${input.turnId}:topic_skill_blocked`,
      metadata: { ...refs, skillId: result.skillResolution.skillId, skillVersion: result.skillResolution.skillVersion, reasonCodes: result.skillResolution.reasonCodes },
      durationMs: input.durationMs,
    });
  }
  if (result.skillDiagnostics.violationCodes.length && result.skillDiagnostics.skillId && result.skillDiagnostics.skillVersion) {
    events.push({
      eventName: "topic_skill_validation_failed",
      eventKey: `turn:${input.turnId}:topic_skill_validation_failed`,
      metadata: {
        ...refs,
        skillId: result.skillDiagnostics.skillId,
        skillVersion: result.skillDiagnostics.skillVersion,
        violationCodes: result.skillDiagnostics.violationCodes,
        responseSource: result.responseSource === "static_safety" ? "local_fallback" : result.responseSource,
      },
      durationMs: input.durationMs,
    });
  }

  if (result.plan.sceneState === "safety_plain") {
    events.push({
      eventName: "safety_plain_triggered",
      eventKey: `turn:${input.turnId}:safety_plain_triggered`,
      metadata: {
        ...refs,
        triggerReason: result.riskLevel === "imminent" ? "imminent" : result.riskLevel === "high" ? "high" : "safety_escalation",
        ruleCodes: result.ruleCodes,
        ordinaryPathShutdown: !result.plan.allowActionDraft && result.actionDraft === null && !transition.invited,
      },
    });
  } else {
    if (result.responseSource === "static_safety") throw new Error("普通支持轮次不能使用 static_safety 响应源");
    events.push({
      eventName: "support_turn_completed",
      eventKey: `turn:${input.turnId}:support_turn_completed`,
      metadata: {
        ...refs,
        riskLevel: result.riskLevel,
        supportMode: result.plan.supportMode,
        sceneState: result.plan.sceneState,
        activeSpirit: result.plan.activeSpirit,
        transitionEligible: transition.eligible,
        assistantReplyLengthBucket: textLengthBucket(result.reply.length),
        responseSource: result.responseSource,
      },
      durationMs: input.durationMs,
    });
  }

  if (transition.invited) {
    events.push({
      eventName: "transition_invited",
      eventKey: `turn:${input.turnId}:transition_invited`,
      metadata: {
        ...refs,
        invitationStyle: transition.invitationCount === 1 ? "low_pressure" : transition.invitationCount > 1 ? "risky" : "unclear",
        invitationCountInTurn: Math.max(1, transition.invitationCount),
        scopeExplained: transition.scopeExplained,
      },
    });
  }
  if (transition.accepted) {
    events.push({ eventName: "transition_accepted", eventKey: `turn:${input.turnId}:transition_accepted`, metadata: { ...refs, acceptanceType: "text_accept" } });
  }
  if (transition.rejected) {
    events.push({ eventName: "transition_rejected", eventKey: `turn:${input.turnId}:transition_rejected`, metadata: { ...refs, rejectionType: "text_reject" } });
  }
  if (transition.returnedToCompanion) {
    events.push({
      eventName: "transition_returned_to_companion",
      eventKey: `turn:${input.turnId}:transition_returned_to_companion`,
      metadata: { ...refs, afterRejection: true, repeatInvitationPresent: transition.repeatInvitationPresent },
    });
  }
  if (input.action) {
    events.push({
      eventName: "action_generated",
      eventKey: `action:${input.action.id}:action_generated`,
      metadata: {
        ...refs,
        actionId: input.action.id,
        actionType: "unknown",
        isSingleAction: isStructurallySingleAction(input.action.text),
        estimatedStartBucket: "unknown",
        externalDependencyLevel: "unknown",
      },
    });
  }
  return events;
}
