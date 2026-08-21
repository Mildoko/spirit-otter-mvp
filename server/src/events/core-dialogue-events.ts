import type { ActiveSpirit, RiskLevel } from "@otter/shared";
import { z } from "zod";

export const CORE_DIALOGUE_EVENT_VERSION = "event-v2" as const;
export const coreDialogueMinimumEventNames = [
  "session_started",
  "user_turn_submitted",
  "support_turn_completed",
  "transition_eligibility_evaluated",
  "transition_invited",
  "transition_accepted",
  "transition_rejected",
  "action_generated",
  "action_confirmed",
  "followup_created",
  "followup_reentered",
  "followup_state_labeled",
  "safety_plain_triggered",
] as const;

const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u);
const conversationFields = {
  sessionId: opaqueId,
  conversationId: opaqueId,
} as const;
const turnFields = { ...conversationFields, turnId: opaqueId } as const;
const riskLevel = z.enum(["low", "elevated", "high", "imminent"]);
const activeSpirit = z.enum(["deep_tide", "shore_pick"]);
const lengthBucket = z.enum(["short", "medium", "long"]);
const routeReasonCodes = z.array(z.string().regex(/^[A-Z0-9_]{1,64}$/u)).max(12);

export const coreDialogueEventSchemas = {
  session_started: z.object({
    sessionId: opaqueId,
    entrySurface: z.literal("web"),
    inviteCodePresent: z.boolean(),
    hasOpenFollowup: z.boolean(),
    hasConfirmedAction: z.boolean(),
  }).strict(),
  session_ended: z.object({ sessionId: opaqueId, endReason: z.enum(["user_exit", "timeout", "app_close"]) }).strict(),
  user_turn_submitted: z.object({
    ...turnFields,
    messageLengthBucket: lengthBucket,
    hasFollowupContext: z.boolean(),
    hasConfirmedActionContext: z.boolean(),
  }).strict(),
  support_turn_completed: z.object({
    ...turnFields,
    riskLevel,
    supportMode: z.enum(["stabilize", "validate", "clarify", "mobilize"]),
    sceneState: z.enum(["underwater_companion", "quiet_water", "near_surface_transition", "surface_organize"]),
    activeSpirit,
    transitionEligible: z.boolean(),
    assistantReplyLengthBucket: lengthBucket,
    responseSource: z.enum(["cloud_model", "local_fallback"]),
  }).strict(),
  transition_eligibility_evaluated: z.object({
    ...turnFields,
    eligible: z.boolean(),
    riskAllowsTransition: z.boolean(),
    routeReasonCodes,
  }).strict(),
  transition_invited: z.object({
    ...turnFields,
    invitationStyle: z.enum(["low_pressure", "unclear", "risky"]),
    invitationCountInTurn: z.number().int().min(1).max(3),
    scopeExplained: z.boolean(),
  }).strict(),
  transition_accepted: z.object({ ...turnFields, acceptanceType: z.enum(["ui_confirm", "text_accept"]) }).strict(),
  transition_rejected: z.object({ ...turnFields, rejectionType: z.enum(["ui_reject", "text_reject"]) }).strict(),
  transition_returned_to_companion: z.object({ ...turnFields, afterRejection: z.boolean(), repeatInvitationPresent: z.boolean() }).strict(),
  action_generated: z.object({
    ...turnFields,
    actionId: opaqueId,
    actionType: z.enum(["start", "shrink", "transition", "friction_reduce", "unknown"]),
    isSingleAction: z.boolean(),
    estimatedStartBucket: z.enum(["under_5m", "between_5_15m", "over_15m", "unknown"]),
    externalDependencyLevel: z.enum(["low", "medium", "high", "unknown"]),
  }).strict(),
  action_confirmed: z.object({ ...conversationFields, actionId: opaqueId, confirmationType: z.enum(["ui_confirm", "text_confirm"]), edited: z.boolean() }).strict(),
  action_edited: z.object({ ...conversationFields, actionId: opaqueId, editedBy: z.enum(["system", "user"]), editReason: z.enum(["clarify", "shrink", "rewrite", "unknown"]) }).strict(),
  action_completed: z.object({ ...conversationFields, actionId: opaqueId }).strict(),
  action_deferred: z.object({ ...conversationFields, actionId: opaqueId }).strict(),
  action_deleted: z.object({ ...conversationFields, actionId: opaqueId, deleteReason: z.enum(["user_delete", "expired", "safety_interrupt", "replaced"]) }).strict(),
  followup_created: z.object({
    ...conversationFields,
    followupId: opaqueId,
    linkedActionId: opaqueId,
    delayBucket: z.enum(["under_24h", "24_48h", "48_72h", "other"]),
  }).strict(),
  followup_reentered: z.object({ ...conversationFields, followupId: opaqueId, reentryAfterDueHoursBucket: z.enum(["under_1h", "1_24h", "over_24h"]) }).strict(),
  followup_state_labeled: z.object({
    ...conversationFields,
    followupId: opaqueId,
    previousState: z.enum(["not_started", "partial_progress", "completed", "blocked", "redefined"]),
    state: z.enum(["not_started", "partial_progress", "completed", "blocked", "redefined"]),
    revision: z.number().int().positive(),
    labelSource: z.literal("ui_select"),
    transitionValid: z.literal(true),
  }).strict(),
  followup_completed: z.object({ ...conversationFields, followupId: opaqueId }).strict(),
  followup_deferred: z.object({ ...conversationFields, followupId: opaqueId }).strict(),
  followup_closed: z.object({ ...conversationFields, followupId: opaqueId, closeReason: z.enum(["completed", "paused", "deleted", "safety_interrupt", "expired"]) }).strict(),
  followup_deleted: z.object({ ...conversationFields, followupId: opaqueId }).strict(),
  risk_assessed: z.object({ ...turnFields, riskLevel, riskSource: z.enum(["hard_rule", "model_signal", "local_fallback", "hybrid"]), ruleCodes: routeReasonCodes }).strict(),
  safety_plain_triggered: z.object({ ...turnFields, triggerReason: z.enum(["high", "imminent", "safety_escalation"]), ruleCodes: routeReasonCodes, ordinaryPathShutdown: z.boolean() }).strict(),
  safety_help_requested: z.object({ ...turnFields, helpType: z.enum(["contact_person", "hotline", "emergency", "leave_scene", "other"]) }).strict(),
  turn_failed: z.object({ ...turnFields, failureStage: z.enum(["orchestrator", "persistence", "unknown"]) }).strict(),
  topic_skill_evaluated: z.object({
    ...turnFields,
    skillId: z.literal("astrology").nullable(),
    skillVersion: z.string().min(1).nullable(),
    status: z.enum(["inactive", "active", "blocked"]),
    capability: z.enum(["cultural_chat", "sun_sign_lookup", "self_reflection", "compatibility_chat"]).nullable(),
    activationSource: z.enum(["none", "explicit_request", "conversation_continuation"]),
    reasonCodes: routeReasonCodes,
  }).strict(),
  topic_skill_activated: z.object({
    ...turnFields,
    skillId: z.literal("astrology"),
    skillVersion: z.string().min(1),
    capability: z.enum(["cultural_chat", "sun_sign_lookup", "self_reflection", "compatibility_chat"]),
    activationSource: z.enum(["explicit_request", "conversation_continuation"]),
    responseSource: z.enum(["cloud_model", "local_fallback"]),
  }).strict(),
  topic_skill_blocked: z.object({
    ...turnFields,
    skillId: z.literal("astrology"),
    skillVersion: z.string().min(1),
    reasonCodes: routeReasonCodes,
  }).strict(),
  topic_skill_validation_failed: z.object({
    ...turnFields,
    skillId: z.literal("astrology"),
    skillVersion: z.string().min(1),
    violationCodes: routeReasonCodes,
    responseSource: z.enum(["cloud_model", "local_fallback"]),
  }).strict(),
} as const;

export type CoreDialogueEventName = keyof typeof coreDialogueEventSchemas;
export type CoreDialogueEventMetadata<Name extends CoreDialogueEventName> = z.input<(typeof coreDialogueEventSchemas)[Name]>;

export interface CoreDialogueEventInput<Name extends CoreDialogueEventName = CoreDialogueEventName> {
  eventName: Name;
  eventKey: string;
  metadata: CoreDialogueEventMetadata<Name>;
  occurredAt?: Date;
  durationMs?: number;
  isReplay?: boolean;
}

export function parseCoreDialogueEventMetadata<Name extends CoreDialogueEventName>(
  eventName: Name,
  metadata: unknown,
): CoreDialogueEventMetadata<Name> {
  return coreDialogueEventSchemas[eventName].parse(metadata) as CoreDialogueEventMetadata<Name>;
}

export function assertEventKey(eventKey: string): string {
  return z.string().regex(/^[A-Za-z0-9:_-]{1,300}$/u).parse(eventKey);
}

export function textLengthBucket(length: number): "short" | "medium" | "long" {
  if (length <= 80) return "short";
  if (length <= 300) return "medium";
  return "long";
}

export function followupDelayBucket(milliseconds: number): "under_24h" | "24_48h" | "48_72h" | "other" {
  const hours = milliseconds / 3_600_000;
  if (hours < 24) return "under_24h";
  if (hours < 48) return "24_48h";
  if (hours < 72) return "48_72h";
  return "other";
}

export function followupReentryBucket(milliseconds: number): "under_1h" | "1_24h" | "over_24h" {
  const hours = Math.max(0, milliseconds) / 3_600_000;
  if (hours < 1) return "under_1h";
  if (hours < 24) return "1_24h";
  return "over_24h";
}

export function isStructurallySingleAction(action: string): boolean {
  return action.length <= 60 && !/(然后|接着|同时|并且|；|;|\n\s*[-*\d])/u.test(action);
}

export function transitionFacts(input: {
  primaryStrategy: string;
  routeReasonCodes: string[];
  riskLevel: RiskLevel;
  activeSpirit: ActiveSpirit;
  reply: string;
}): {
  eligible: boolean;
  invited: boolean;
  accepted: boolean;
  rejected: boolean;
  returnedToCompanion: boolean;
  invitationCount: number;
  scopeExplained: boolean;
  repeatInvitationPresent: boolean;
} {
  const invitationPattern = /(?:如果你愿意|要不要|愿不愿意|是否愿意|也可以先不).{0,24}(?:整理|行动|范围|一步|往前|试试)/gu;
  const invitationCount = input.reply.match(invitationPattern)?.length ?? 0;
  const invitationPlanned = ["invite_one_small_action", "clarify_then_invite"].includes(input.primaryStrategy);
  const invited = invitationPlanned && invitationCount > 0;
  const accepted = input.routeReasonCodes.includes("TRANSITION_ACCEPTED");
  const rejected = input.routeReasonCodes.includes("USER_DECLINED_TRANSITION");
  return {
    eligible: input.riskLevel === "low" && (invitationPlanned || accepted),
    invited,
    accepted,
    rejected,
    returnedToCompanion: input.activeSpirit === "deep_tide" && rejected,
    invitationCount,
    scopeExplained: /(?:一个|一步|一点|很小|小范围)/u.test(input.reply),
    repeatInvitationPresent: invitationCount > 0 && rejected,
  };
}
