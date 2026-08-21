import type { ExpressiveAccent, GuidanceState, GuidanceStateV2, RawSignals, ResponsePlan, TopicSkillGuidanceStateV1 } from "@otter/shared";
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

const topicSkillStateSchema = z.object({
  activeSkillId: z.literal("astrology").nullable(),
  activeVersion: z.string().min(1).nullable(),
  lastActivatedTurn: z.number().int().min(0).nullable(),
  suspendedSkillIds: z.array(z.literal("astrology")).max(1),
}).strict();

export const guidanceStateV2Schema = guidanceStateV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(2),
  topicSkill: topicSkillStateSchema,
}).strict();

export const DEFAULT_TOPIC_SKILL_STATE: TopicSkillGuidanceStateV1 = Object.freeze({
  activeSkillId: null,
  activeVersion: null,
  lastActivatedTurn: null,
  suspendedSkillIds: [],
});

export const DEFAULT_GUIDANCE_STATE: GuidanceStateV2 = Object.freeze({
  schemaVersion: 2,
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
  topicSkill: DEFAULT_TOPIC_SKILL_STATE,
});

export function parseGuidanceState(value: unknown): GuidanceStateV2 {
  const parsedV2 = guidanceStateV2Schema.safeParse(value);
  if (parsedV2.success) return parsedV2.data;
  const parsedV1 = guidanceStateV1Schema.safeParse(value);
  if (parsedV1.success) return { ...parsedV1.data, schemaVersion: 2, topicSkill: { ...DEFAULT_TOPIC_SKILL_STATE, suspendedSkillIds: [] } };
  return { ...DEFAULT_GUIDANCE_STATE, topicSkill: { ...DEFAULT_TOPIC_SKILL_STATE, suspendedSkillIds: [] } };
}

export interface GuidanceIntent {
  acceptedTransition: boolean;
  declinedTransition: boolean;
  requestNoQuestions: boolean;
  allowQuestions: boolean;
  directActionRequest: boolean;
}

export function advanceGuidanceState(input: {
  previous: GuidanceState;
  intent: GuidanceIntent;
  signals: RawSignals;
  plan: ResponsePlan;
  finalReply: string;
  deliveredAccent: ExpressiveAccent;
  topicSkill?: TopicSkillGuidanceStateV1;
}): GuidanceStateV2 {
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
    schemaVersion: 2,
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
    topicSkill: input.topicSkill ?? (input.previous.schemaVersion === 2 ? input.previous.topicSkill : { ...DEFAULT_TOPIC_SKILL_STATE, suspendedSkillIds: [] }),
  };
}
