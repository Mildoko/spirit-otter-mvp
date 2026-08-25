import { describe, expect, it } from "vitest";
import type { ResponsePlan, TopicLeadGuidanceStateV1 } from "@otter/shared";
import { deactivateTopicLead, resolveTopicLeadTurn, selectTopicCard, topicCards } from "../../src/modules/topics/topic-lead.js";
import { DEFAULT_TOPIC_LEAD_STATE } from "../../src/modules/support/guidance-state.js";

const plan = (primaryStrategy: string): ResponsePlan => ({
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "converse", sceneState: "surface_chat",
  primaryStrategy, allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0, allowedContent: [], forbiddenContent: [],
});
const fresh = (): TopicLeadGuidanceStateV1 => ({ ...DEFAULT_TOPIC_LEAD_STATE, recentTopicIds: [], recentCategories: [] });

describe("local topic lead engine", () => {
  it("ships 32 balanced low-sensitivity cards", () => {
    expect(topicCards).toHaveLength(32);
    const counts = new Map<string, number>();
    for (const item of topicCards) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    expect([...counts.values()]).toEqual(Array(8).fill(4));
    expect(topicCards.every((item) => item.sensitivity === "low" && item.anchorKeywords.length > 0)).toBe(true);
  });

  it("never selects one of the six recent topics", () => {
    const previous = { ...fresh(), recentTopicIds: topicCards.slice(0, 6).map((item) => item.id) };
    const selected = selectTopicCard(previous, false, () => 0);
    expect(previous.recentTopicIds).not.toContain(selected.id);
  });

  it("switches category and changes form after repeated rejection", () => {
    const previous: TopicLeadGuidanceStateV1 = {
      status: "active", source: "explicit_request", currentTopicId: "imagination_weather_door", currentCategory: "imagination",
      startedAtTurn: 1, lastActivityTurn: 2, recentTopicIds: ["imagination_weather_door"], recentCategories: ["imagination"], rejectionCount: 2,
    };
    const turn = resolveTopicLeadTurn({ plan: plan("switch_topic"), previous, turnIndex: 3, source: "explicit_request", noQuestions: false, random: () => 0 });
    expect(turn?.card.category).not.toBe("imagination");
    expect(turn?.card.form).not.toBe("thought_experiment");
    expect(turn?.nextState.recentTopicIds).toHaveLength(2);
  });

  it("renders a no-question card while preserving the active topic", () => {
    const turn = resolveTopicLeadTurn({ plan: plan("open_topic"), previous: fresh(), turnIndex: 1, source: "low_signal", noQuestions: true, random: () => 0 });
    expect(turn?.fallbackReply).not.toMatch(/[？?]/u);
    expect(turn?.nextState).toMatchObject({ status: "active", source: "low_signal", lastActivityTurn: 1 });
    const inactive = deactivateTopicLead(turn!.nextState);
    expect(inactive.status).toBe("inactive");
    expect(inactive.recentTopicIds).toEqual(turn!.nextState.recentTopicIds);
  });
});
