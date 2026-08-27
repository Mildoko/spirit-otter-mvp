import type {
  AgentHandoffProposalV1,
  AuthorizedAgentHandoffV1,
  InterestProfileEntryV1,
} from "@otter/shared";
import { z } from "zod";

const agentId = z.enum(["zen_deer", "spirit_otter", "bird_courier"]);
const opaqueId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/u);
const timestamp = z.string().datetime({ offset: true });

const handoffContextSchema = z.object({
  focus: z.enum(["emotional_support", "meaning_reflection", "practical_planning", "public_item_discussion"]),
  publicItemId: opaqueId.nullable(),
  actionId: opaqueId.nullable(),
  followupId: opaqueId.nullable(),
}).strict();

const handoffShape = {
  schemaVersion: z.literal(1),
  id: opaqueId,
  fromAgentId: agentId,
  toAgentId: agentId,
  initiatedBy: z.enum(["user", "agent"]),
  reason: z.enum(["user_requested", "capability_match", "public_item_discussion"]),
  context: handoffContextSchema,
  createdAt: timestamp,
  expiresAt: timestamp,
};

function validateHandoffWindow(
  value: { fromAgentId: string; toAgentId: string; createdAt: string; expiresAt: string },
  context: z.RefinementCtx,
): void {
  if (value.fromAgentId === value.toAgentId) {
    context.addIssue({ code: "custom", path: ["toAgentId"], message: "handoff target must differ from source" });
  }
  const durationMs = Date.parse(value.expiresAt) - Date.parse(value.createdAt);
  if (durationMs <= 0 || durationMs > P2_DATA_LIFECYCLE_V1.handoff_proposal.maxRetentionMs) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "handoff proposal must expire within 15 minutes" });
  }
}

export const agentHandoffProposalSchema = z.object({
  ...handoffShape,
  status: z.literal("proposed"),
}).strict().superRefine(validateHandoffWindow);

export const authorizedAgentHandoffSchema = z.object({
  ...handoffShape,
  status: z.literal("authorized"),
  authorization: z.literal("explicit_user_confirm"),
  authorizedAt: timestamp,
}).strict().superRefine((value, context) => {
  validateHandoffWindow(value, context);
  const authorizedAt = Date.parse(value.authorizedAt);
  if (authorizedAt < Date.parse(value.createdAt) || authorizedAt > Date.parse(value.expiresAt)) {
    context.addIssue({ code: "custom", path: ["authorizedAt"], message: "authorization must occur before proposal expiry" });
  }
});

const interestSelectionSchema = z.discriminatedUnion("category", [
  z.object({ category: z.literal("topic"), valueCode: z.enum(["arts_culture", "outdoors", "learning", "wellbeing", "community", "food_music"]) }).strict(),
  z.object({ category: z.literal("time_window"), valueCode: z.enum(["weekday_day", "weekday_evening", "weekend_day", "weekend_evening", "flexible"]) }).strict(),
  z.object({ category: z.literal("location_scope"), valueCode: z.enum(["same_city", "nearby_city", "online_only", "no_preference"]) }).strict(),
  z.object({ category: z.literal("budget_band"), valueCode: z.enum(["free", "under_100", "100_300", "over_300", "flexible"]) }).strict(),
  z.object({ category: z.literal("social_load"), valueCode: z.enum(["solo_friendly", "small_group", "group", "no_preference"]) }).strict(),
  z.object({ category: z.literal("format"), valueCode: z.enum(["in_person", "online", "hybrid", "no_preference"]) }).strict(),
]);

export const interestProfileEntrySchema = z.object({
  schemaVersion: z.literal(1),
  id: opaqueId,
  selection: interestSelectionSchema,
  source: z.literal("user_explicit_selection"),
  status: z.literal("confirmed"),
  authorizedAt: timestamp,
  createdAt: timestamp,
  expiresAt: timestamp,
}).strict().superRefine((value, context) => {
  const createdAt = Date.parse(value.createdAt);
  const authorizedAt = Date.parse(value.authorizedAt);
  const durationMs = Date.parse(value.expiresAt) - createdAt;
  if (authorizedAt > createdAt) {
    context.addIssue({ code: "custom", path: ["authorizedAt"], message: "interest must be authorized before it is created" });
  }
  if (durationMs <= 0 || durationMs > P2_DATA_LIFECYCLE_V1.interest_profile.maxRetentionMs) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "interest profile must expire within 30 days" });
  }
});

export const P2_DATA_LIFECYCLE_V1 = {
  handoff_proposal: {
    classification: "ephemeral_private",
    maxRetentionMs: 15 * 60 * 1000,
    allowedContent: ["agent_ids", "reason_code", "focus_code", "opaque_internal_refs"],
    deleteOn: ["expired", "user_cancelled", "safety_interrupted", "conversation_deleted", "user_deleted"],
  },
  handoff_receipt: {
    classification: "structured_private",
    maxRetentionMs: 30 * 24 * 60 * 60 * 1000,
    allowedContent: ["agent_ids", "reason_code", "focus_code", "authorization_timestamp", "opaque_internal_refs"],
    deleteOn: ["record_expired", "conversation_deleted", "user_deleted"],
  },
  interest_profile: {
    classification: "user_controlled_private",
    maxRetentionMs: 30 * 24 * 60 * 60 * 1000,
    allowedContent: ["enumerated_selection", "authorization_timestamp"],
    deleteOn: ["entry_deleted", "all_interests_deleted", "record_expired", "user_deleted"],
  },
  public_catalog: {
    classification: "public_read_only",
    maxRetentionMs: 0,
    allowedContent: ["public_item"],
    deleteOn: [],
  },
} as const;

export function parseAgentHandoffProposal(value: unknown): AgentHandoffProposalV1 {
  return agentHandoffProposalSchema.parse(value);
}

export function parseAuthorizedAgentHandoff(value: unknown): AuthorizedAgentHandoffV1 {
  return authorizedAgentHandoffSchema.parse(value);
}

export function parseInterestProfileEntry(value: unknown): InterestProfileEntryV1 {
  return interestProfileEntrySchema.parse(value);
}
