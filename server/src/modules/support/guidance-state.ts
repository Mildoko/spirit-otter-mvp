import type { ExpressiveAccent, GuidanceStateV1, RawSignals, ResponsePlan } from "@otter/shared";
import { z } from "zod";

export const guidanceStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  turnIndex: z.number().int().min(0),
  clarifyAttemptCount: z.number().int().min(0).max(2),
  transitionInvitePending: z.boolean(),
  lastTransitionInviteTurn: z.number().int().min(0).nullable(),
  transitionDeclined: z.boolean(),
  userRequestedNoQuestions: z.boolean(),
  lastMetaphorTurn: z.number().int().min(0).nullable(),
  lastAphorismTurn: z.number().int().min(0).nullable(),
  lastHumorTurn: z.number().int().min(0).nullable(),
  lastExpressionClarity: z.number().min(0).max(1).nullable(),
  lastProgressReadiness: z.number().min(0).max(1).nullable(),
}).strict();

export const DEFAULT_GUIDANCE_STATE: GuidanceStateV1 = Object.freeze({
  schemaVersion: 1,
  turnIndex: 0,
  clarifyAttemptCount: 0,
  transitionInvitePending: false,
  lastTransitionInviteTurn: null,
  transitionDeclined: false,
  userRequestedNoQuestions: false,
  lastMetaphorTurn: null,
  lastAphorismTurn: null,
  lastHumorTurn: null,
  lastExpressionClarity: null,
  lastProgressReadiness: null,
});

export function parseGuidanceState(value: unknown): GuidanceStateV1 {
  const parsed = guidanceStateV1Schema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_GUIDANCE_STATE };
}

export interface GuidanceIntent {
  acceptedTransition: boolean;
  declinedTransition: boolean;
  requestNoQuestions: boolean;
  allowQuestions: boolean;
  directActionRequest: boolean;
}

export function advanceGuidanceState(input: {
  previous: GuidanceStateV1;
  intent: GuidanceIntent;
  signals: RawSignals;
  plan: ResponsePlan;
  finalReply: string;
  deliveredAccent: ExpressiveAccent;
}): GuidanceStateV1 {
  const turnIndex = input.previous.turnIndex + 1;
  const clarification = ["clarify_low_signal", "clarify_then_invite"].includes(input.plan.primaryStrategy);
  const madeProgress = input.signals.expressionClarityScore >= 0.45 || input.intent.directActionRequest || input.intent.acceptedTransition;
  const clarifyAttemptCount = madeProgress ? 0 : clarification ? Math.min(2, input.previous.clarifyAttemptCount + 1) : input.previous.clarifyAttemptCount;
  const invited = input.plan.primaryStrategy === "clarify_then_invite" || input.plan.primaryStrategy === "invite_one_small_action";
  const transitionDeclined = input.intent.declinedTransition
    ? true
    : input.intent.directActionRequest || input.intent.acceptedTransition ? false : input.previous.transitionDeclined;
  const userRequestedNoQuestions = input.intent.allowQuestions
    ? false
    : input.intent.requestNoQuestions ? true : input.previous.userRequestedNoQuestions;

  return {
    schemaVersion: 1,
    turnIndex,
    clarifyAttemptCount,
    transitionInvitePending: invited && !transitionDeclined,
    lastTransitionInviteTurn: invited ? turnIndex : input.previous.lastTransitionInviteTurn,
    transitionDeclined,
    userRequestedNoQuestions,
    lastMetaphorTurn: input.deliveredAccent === "metaphor" ? turnIndex : input.previous.lastMetaphorTurn,
    lastAphorismTurn: input.deliveredAccent === "aphorism" ? turnIndex : input.previous.lastAphorismTurn,
    lastHumorTurn: input.deliveredAccent === "dry_humor" ? turnIndex : input.previous.lastHumorTurn,
    lastExpressionClarity: input.signals.expressionClarityScore,
    lastProgressReadiness: input.signals.progressReadinessScore,
  };
}
