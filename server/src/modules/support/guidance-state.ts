import type { ExpressiveAccent, GuidanceState, GuidanceStateV4, HealingBriefV1, HealingGuidanceStateV1, RawSignals, ResponsePlan, TopicLeadGuidanceStateV1, TopicSkillGuidanceStateV1 } from "@otter/shared";
import { z } from "zod";
import { randomUUID } from "node:crypto";

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

const topicCategorySchema = z.enum([
  "imagination", "daily_observation", "culture_story", "knowledge_curiosity",
  "word_game", "preference_tradeoff", "creative_coauthoring", "light_future",
]);

const topicLeadStateSchema = z.object({
  status: z.enum(["inactive", "active"]),
  source: z.enum(["explicit_request", "low_signal"]).nullable(),
  currentTopicId: z.string().min(1).max(80).nullable(),
  currentCategory: topicCategorySchema.nullable(),
  startedAtTurn: z.number().int().min(0).nullable(),
  lastActivityTurn: z.number().int().min(0).nullable(),
  recentTopicIds: z.array(z.string().min(1).max(80)).max(6),
  recentCategories: z.array(topicCategorySchema).max(2),
  rejectionCount: z.number().int().min(0).max(99),
}).strict().superRefine((value, ctx) => {
  const complete = value.source !== null && value.currentTopicId !== null && value.currentCategory !== null
    && value.startedAtTurn !== null && value.lastActivityTurn !== null;
  if (value.status === "active" && !complete) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "active topic lead requires complete current topic data" });
  if (value.status === "inactive" && (value.source !== null || value.currentTopicId !== null || value.currentCategory !== null || value.startedAtTurn !== null || value.lastActivityTurn !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "inactive topic lead cannot retain an active topic" });
  }
});

export const guidanceStateV3Schema = guidanceStateV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(3),
  topicSkill: topicSkillStateSchema,
  topicLead: topicLeadStateSchema,
}).strict();

const healingStateSchema = z.object({
  segmentId: z.string().min(1).max(80),
  status: z.enum(["inactive", "active", "repairing"]),
  depth: z.enum(["recognize", "deepen", "integrate", "bridge"]),
  lastGoal: z.enum(["felt_seen", "emotional_softening", "meaning_clarity", "self_compassion", "agency", "reality_bridge"]).nullable(),
  rupture: z.enum(["none", "too_abstract", "too_light", "misread", "unwanted_advice", "not_helpful"]),
  consecutiveMissCount: z.number().int().min(0).max(99),
  lastActivityTurn: z.number().int().min(0).nullable(),
  expiresAt: z.string().datetime().nullable(),
  deepAnalysisEnabled: z.boolean(),
}).strict();

export const guidanceStateV4Schema = guidanceStateV1Schema.omit({ schemaVersion: true }).extend({
  schemaVersion: z.literal(4),
  topicSkill: topicSkillStateSchema,
  topicLead: topicLeadStateSchema,
  healing: healingStateSchema,
}).strict();

export const guidanceStateSchema = z.union([guidanceStateV4Schema, guidanceStateV3Schema, guidanceStateV2Schema, guidanceStateV1Schema]);

export const DEFAULT_TOPIC_SKILL_STATE: TopicSkillGuidanceStateV1 = Object.freeze({
  activeSkillId: null,
  activeVersion: null,
  lastActivatedTurn: null,
  suspendedSkillIds: [],
});

export const DEFAULT_TOPIC_LEAD_STATE: TopicLeadGuidanceStateV1 = Object.freeze({
  status: "inactive",
  source: null,
  currentTopicId: null,
  currentCategory: null,
  startedAtTurn: null,
  lastActivityTurn: null,
  recentTopicIds: [],
  recentCategories: [],
  rejectionCount: 0,
});

export const DEFAULT_HEALING_STATE: HealingGuidanceStateV1 = Object.freeze({
  segmentId: "segment-initial",
  status: "inactive",
  depth: "recognize",
  lastGoal: null,
  rupture: "none",
  consecutiveMissCount: 0,
  lastActivityTurn: null,
  expiresAt: null,
  deepAnalysisEnabled: true,
});

export function createDefaultGuidanceState(deepAnalysisEnabled = true): GuidanceStateV4 {
  return {
  schemaVersion: 4,
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
  topicSkill: { ...DEFAULT_TOPIC_SKILL_STATE, suspendedSkillIds: [] },
  topicLead: { ...DEFAULT_TOPIC_LEAD_STATE, recentTopicIds: [], recentCategories: [] },
  healing: { ...DEFAULT_HEALING_STATE, segmentId: `segment-${randomUUID()}`, deepAnalysisEnabled },
  };
}

export const DEFAULT_GUIDANCE_STATE: GuidanceStateV4 = Object.freeze(createDefaultGuidanceState());

export function parseGuidanceState(value: unknown): GuidanceStateV4 {
  const parsedV4 = guidanceStateV4Schema.safeParse(value);
  if (parsedV4.success) return {
    ...parsedV4.data,
    topicSkill: { ...parsedV4.data.topicSkill, suspendedSkillIds: [...parsedV4.data.topicSkill.suspendedSkillIds] },
    topicLead: { ...parsedV4.data.topicLead, recentTopicIds: [...parsedV4.data.topicLead.recentTopicIds], recentCategories: [...parsedV4.data.topicLead.recentCategories] },
    healing: { ...parsedV4.data.healing },
  };
  const parsedV3 = guidanceStateV3Schema.safeParse(value);
  if (parsedV3.success) return {
    ...parsedV3.data,
    schemaVersion: 4,
    topicSkill: { ...parsedV3.data.topicSkill, suspendedSkillIds: [...parsedV3.data.topicSkill.suspendedSkillIds] },
    topicLead: { ...parsedV3.data.topicLead, recentTopicIds: [...parsedV3.data.topicLead.recentTopicIds], recentCategories: [...parsedV3.data.topicLead.recentCategories] },
    healing: { ...DEFAULT_HEALING_STATE, segmentId: `segment-${randomUUID()}` },
  };
  const parsedV2 = guidanceStateV2Schema.safeParse(value);
  if (parsedV2.success) return { ...parsedV2.data, schemaVersion: 4, topicSkill: { ...parsedV2.data.topicSkill, suspendedSkillIds: [...parsedV2.data.topicSkill.suspendedSkillIds] }, topicLead: { ...DEFAULT_TOPIC_LEAD_STATE, recentTopicIds: [], recentCategories: [] }, healing: { ...DEFAULT_HEALING_STATE, segmentId: `segment-${randomUUID()}` } };
  const parsedV1 = guidanceStateV1Schema.safeParse(value);
  if (parsedV1.success) return { ...parsedV1.data, schemaVersion: 4, topicSkill: { ...DEFAULT_TOPIC_SKILL_STATE, suspendedSkillIds: [] }, topicLead: { ...DEFAULT_TOPIC_LEAD_STATE, recentTopicIds: [], recentCategories: [] }, healing: { ...DEFAULT_HEALING_STATE, segmentId: `segment-${randomUUID()}` } };
  return createDefaultGuidanceState();
}

export function resetHealingState(previous: GuidanceState, segmentId: string, deepAnalysisEnabled?: boolean): GuidanceStateV4 {
  const parsed = parseGuidanceState(previous);
  return { ...parsed, healing: { ...DEFAULT_HEALING_STATE, segmentId, deepAnalysisEnabled: deepAnalysisEnabled ?? parsed.healing.deepAnalysisEnabled } };
}

export function resetConversationSegmentState(previous: GuidanceState, segmentId: string, deepAnalysisEnabled?: boolean): GuidanceStateV4 {
  const parsed = resetHealingState(previous, segmentId, deepAnalysisEnabled);
  return {
    ...parsed,
    clarifyAttemptCount: 0,
    transitionInvitePending: false,
    lastTransitionInviteTurn: null,
    transitionDeclined: false,
    topicLead: {
      ...DEFAULT_TOPIC_LEAD_STATE,
      recentTopicIds: [...parsed.topicLead.recentTopicIds],
      recentCategories: [...parsed.topicLead.recentCategories],
    },
  };
}

export interface GuidanceIntent {
  acceptedTransition: boolean;
  declinedTransition: boolean;
  requestNoQuestions: boolean;
  allowQuestions: boolean;
  directActionRequest: boolean;
  requestTopicLead: boolean;
  lowSignalTopicCue: boolean;
  requestTopicSwitch: boolean;
  requestTopicStop: boolean;
}

export function advanceGuidanceState(input: {
  previous: GuidanceState;
  intent: GuidanceIntent;
  signals: RawSignals;
  plan: ResponsePlan;
  finalReply: string;
  deliveredAccent: ExpressiveAccent;
  topicSkill?: TopicSkillGuidanceStateV1;
  topicLead?: TopicLeadGuidanceStateV1;
  healingBrief?: HealingBriefV1;
  deepAnalysisEnabled?: boolean;
  resetHealing?: boolean;
  now?: Date;
}): GuidanceStateV4 {
  const previous = parseGuidanceState(input.previous);
  const turnIndex = input.previous.turnIndex + 1;
  const clarification = ["clarify_low_signal", "clarify_then_invite"].includes(input.plan.primaryStrategy);
  const madeProgress = input.signals.expressionClarityScore >= 0.45 || input.intent.directActionRequest || input.intent.acceptedTransition;
  const clarifyAttemptCount = madeProgress ? 0 : clarification ? Math.min(2, input.previous.clarifyAttemptCount + 1) : input.previous.clarifyAttemptCount;
  const invited = input.plan.primaryStrategy === "clarify_then_invite" || input.plan.primaryStrategy === "invite_one_small_action" || input.plan.primaryStrategy === "material_crisis_support";
  const transitionDeclined = input.intent.declinedTransition
    ? true
    : input.intent.directActionRequest || input.intent.acceptedTransition ? false : input.previous.transitionDeclined;
  const userRequestedNoQuestions = input.intent.allowQuestions
    ? false
    : input.intent.requestNoQuestions ? true : input.previous.userRequestedNoQuestions;

  const now = input.now ?? new Date();
  const healingBrief = input.healingBrief;
  const healingExpired = previous.healing.expiresAt !== null && new Date(previous.healing.expiresAt).getTime() <= now.getTime();
  const previousHealing = healingExpired
    ? { ...DEFAULT_HEALING_STATE, segmentId: `segment-${randomUUID()}`, deepAnalysisEnabled: previous.healing.deepAnalysisEnabled }
    : previous.healing;
  const nextHealing: HealingGuidanceStateV1 = input.resetHealing || input.plan.sceneState === "safety_plain"
    ? { ...DEFAULT_HEALING_STATE, segmentId: previousHealing.segmentId, deepAnalysisEnabled: input.deepAnalysisEnabled ?? previousHealing.deepAnalysisEnabled }
    : healingBrief && healingBrief.status !== "inactive"
      ? {
          ...previousHealing,
          status: healingBrief.status === "repairing" ? "repairing" : "active",
          depth: healingBrief.depth,
          lastGoal: healingBrief.goal,
          rupture: healingBrief.rupture,
          consecutiveMissCount: healingBrief.rupture === "none" ? 0 : Math.min(99, previousHealing.consecutiveMissCount + 1),
          lastActivityTurn: turnIndex,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          deepAnalysisEnabled: input.deepAnalysisEnabled ?? previousHealing.deepAnalysisEnabled,
        }
      : { ...previousHealing, deepAnalysisEnabled: input.deepAnalysisEnabled ?? previousHealing.deepAnalysisEnabled };

  return {
    schemaVersion: 4,
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
    topicSkill: input.topicSkill ?? { ...previous.topicSkill, suspendedSkillIds: [...previous.topicSkill.suspendedSkillIds] },
    topicLead: input.topicLead ?? { ...previous.topicLead, recentTopicIds: [...previous.topicLead.recentTopicIds], recentCategories: [...previous.topicLead.recentCategories] },
    healing: nextHealing,
  };
}
