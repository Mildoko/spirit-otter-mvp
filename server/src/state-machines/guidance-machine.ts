import type { ExpressiveAccent, GuidanceStateV4, HealingGuidanceStateV1 } from "@otter/shared";
import { assign, createActor, setup } from "xstate";
import { z } from "zod";
import {
  DEFAULT_HEALING_STATE,
  parseGuidanceState,
  type AdvanceGuidanceStateInput,
} from "../modules/support/guidance-state.js";

export type GuidanceMachineEvent = { type: "ADVANCE"; input: Omit<AdvanceGuidanceStateInput, "previous"> };

const forbiddenTextKeys = new Set(["userText", "currentUserText", "rawText", "message", "prompt", "finalReply"]);
const guidanceEventEnvelopeSchema = z.object({
  type: z.literal("ADVANCE"),
  input: z.record(z.string(), z.unknown()).superRefine((value, context) => {
    const visit = (candidate: unknown, path: Array<string | number>): void => {
      if (!candidate || typeof candidate !== "object") return;
      for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) {
        if (forbiddenTextKeys.has(key)) context.addIssue({ code: "custom", message: `${key} is forbidden in guidance events`, path: [...path, key] });
        visit(nested, [...path, key]);
      }
    };
    visit(value, []);
  }),
}).strict();

export function parseGuidanceMachineEvent(value: unknown): GuidanceMachineEvent {
  guidanceEventEnvelopeSchema.parse(value);
  return value as GuidanceMachineEvent;
}

function nextGuidanceState(previousValue: GuidanceStateV4, input: Omit<AdvanceGuidanceStateInput, "previous">): GuidanceStateV4 {
  const previous = parseGuidanceState(previousValue);
  const turnIndex = previous.turnIndex + 1;
  const clarification = ["clarify_low_signal", "clarify_then_invite"].includes(input.plan.primaryStrategy);
  const madeProgress = input.signals.expressionClarityScore >= 0.45 || input.intent.directActionRequest || input.intent.acceptedTransition;
  const clarifyAttemptCount = madeProgress ? 0 : clarification ? Math.min(2, previous.clarifyAttemptCount + 1) : previous.clarifyAttemptCount;
  const invited = ["clarify_then_invite", "invite_one_small_action", "material_crisis_support"].includes(input.plan.primaryStrategy);
  const transitionDeclined = input.intent.declinedTransition
    ? true
    : input.intent.directActionRequest || input.intent.acceptedTransition ? false : previous.transitionDeclined;
  const userRequestedNoQuestions = input.intent.allowQuestions
    ? false
    : input.intent.requestNoQuestions ? true : previous.userRequestedNoQuestions;
  const now = input.now ?? new Date();
  const healingExpired = previous.healing.expiresAt !== null && new Date(previous.healing.expiresAt).getTime() <= now.getTime();
  const previousHealing: HealingGuidanceStateV1 = healingExpired
    ? {
        ...DEFAULT_HEALING_STATE,
        segmentId: input.segmentIdFactory?.() ?? previous.healing.segmentId,
        deepAnalysisEnabled: previous.healing.deepAnalysisEnabled,
      }
    : previous.healing;
  const healingBrief = input.healingBrief;
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

  const deliveredAccent: ExpressiveAccent = input.deliveredAccent;
  return {
    schemaVersion: 4,
    turnIndex,
    clarifyAttemptCount,
    transitionInvitePending: invited && !transitionDeclined,
    lastTransitionInviteTurn: invited ? turnIndex : previous.lastTransitionInviteTurn,
    transitionDeclined,
    userRequestedNoQuestions,
    lastMetaphorTurn: deliveredAccent === "metaphor" ? turnIndex : previous.lastMetaphorTurn,
    lastAphorismTurn: deliveredAccent === "aphorism" ? turnIndex : previous.lastAphorismTurn,
    lastHumorTurn: deliveredAccent === "dry_humor" ? turnIndex : previous.lastHumorTurn,
    lastExpressionClarity: input.signals.expressionClarityScore,
    lastProgressReadiness: input.signals.progressReadinessScore,
    topicSkill: input.topicSkill ?? { ...previous.topicSkill, suspendedSkillIds: [...previous.topicSkill.suspendedSkillIds] },
    topicLead: input.topicLead ?? { ...previous.topicLead, recentTopicIds: [...previous.topicLead.recentTopicIds], recentCategories: [...previous.topicLead.recentCategories] },
    healing: nextHealing,
  };
}

export const guidanceMachine = setup({
  types: {
    context: {} as { current: GuidanceStateV4 },
    input: {} as { previous: GuidanceStateV4 },
    events: {} as GuidanceMachineEvent,
  },
}).createMachine({
  id: "guidance-v1",
  initial: "ready",
  context: ({ input }) => ({ current: parseGuidanceState(input.previous) }),
  states: {
    ready: {
      on: {
        ADVANCE: {
          actions: assign({ current: ({ context, event }) => nextGuidanceState(context.current, event.input) }),
        },
      },
    },
  },
});

export function advanceGuidanceStateXState(input: AdvanceGuidanceStateInput): GuidanceStateV4 {
  const actor = createActor(guidanceMachine, { input: { previous: parseGuidanceState(input.previous) } });
  actor.start();
  const { previous, ...eventInput } = input;
  actor.send(parseGuidanceMachineEvent({ type: "ADVANCE", input: eventInput }));
  const current = actor.getSnapshot().context.current;
  actor.stop();
  return current;
}
