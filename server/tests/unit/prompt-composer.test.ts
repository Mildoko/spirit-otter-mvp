import { describe, expect, it } from "vitest";
import type { EmotionState, ResponsePlan } from "@otter/shared";
import { composeCharacterPrompt } from "../../src/modules/character/prompt-composer.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { resolveTopicLeadTurn } from "../../src/modules/topics/topic-lead.js";
import { DEFAULT_TOPIC_LEAD_STATE } from "../../src/modules/support/guidance-state.js";

const state: EmotionState = {
  valence: -0.2, arousal: 0.3, stressLoad: 0.5, cognitiveOverload: 0.4, supportNeed: 0.4,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 1000).toISOString(),
};
const plan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["DEFAULT_COMPANION"], lockTurnsRemaining: 0,
  allowedContent: ["具体承接"], forbiddenContent: ["诊断"],
};
const style = resolveResponseStyle({ plan, state, recentContext: [], userText: "今天还是很累", riskLevel: "low" });

describe("layered character prompt composer", () => {
  it("orders safety, core soul, spirit, state, memory and current input", () => {
    const prompt = composeCharacterPrompt({
      plan,
      state,
      style,
      memories: [{ id: "m1", kind: "user_preference", content: "喜欢一次只问一个问题", observedAt: "2026-08-14T00:00:00.000Z", relevanceNote: "current_preference" }],
      actionContext: { action: "写汇报标题" },
      recentContext: ["assistant: 我在听"],
      userText: "今天还是很累",
    });
    expect(prompt.system.indexOf("安全边界")).toBeLessThan(prompt.system.indexOf("Core Soul"));
    expect(prompt.system.indexOf("Core Soul")).toBeLessThan(prompt.system.indexOf("Active Spirit"));
    expect(prompt.system.indexOf("当前状态")).toBeLessThan(prompt.system.indexOf("长期记忆"));
    expect(prompt.system.indexOf("当前状态")).toBeLessThan(prompt.system.indexOf("本轮回应风格"));
    expect(prompt.system.indexOf("本轮回应风格")).toBeLessThan(prompt.system.indexOf("长期记忆"));
    expect(prompt.system).toContain("喜欢一次只问一个问题");
    expect(prompt.system).toContain("写汇报标题");
    expect(prompt.user).toContain("今天还是很累");
    expect(prompt.system).not.toContain("情绪承接（只调整表达");
  });

  it("omits all character, lore and relationship memory on safety plain path", () => {
    const prompt = composeCharacterPrompt({
      plan: { ...plan, sceneState: "safety_plain" },
      state,
      style,
      memories: [{ id: "m1", kind: "relationship_milestone", content: "关系记忆", observedAt: "2026-08-14T00:00:00.000Z", relevanceNote: "relationship_context" }],
      recentContext: [],
      userText: "危险内容",
    });
    expect(prompt.system).not.toContain("Core Soul");
    expect(prompt.system).not.toContain("深汐");
    expect(prompt.system).not.toContain("关系记忆");
    expect(prompt.system).not.toContain("本轮回应风格");
  });

  it("uses the fixed topic card without emotion, memory, or action context", () => {
    const topicPlan: ResponsePlan = { ...plan, supportMode: "converse", sceneState: "surface_chat", primaryStrategy: "open_topic" };
    const topicStyle = resolveResponseStyle({ plan: topicPlan, state, recentContext: [], userText: "我好无聊", riskLevel: "low", interactionMode: "casual_topic" });
    const topicLead = resolveTopicLeadTurn({
      plan: topicPlan,
      previous: { ...DEFAULT_TOPIC_LEAD_STATE, recentTopicIds: [], recentCategories: [] },
      turnIndex: 1, source: "low_signal", noQuestions: false, random: () => 0,
    })!;
    const prompt = composeCharacterPrompt({
      plan: topicPlan, state, style: topicStyle, topicLead,
      memories: [{ id: "m1", kind: "user_preference", content: "旧偏好", observedAt: "2026-08-14T00:00:00.000Z", relevanceNote: "current_preference" }],
      actionContext: { action: "旧行动" }, recentContext: [], userText: "我好无聊",
    });
    expect(prompt.system).toContain("主动带聊");
    expect(prompt.system).toContain(topicLead.card.anchorKeywords[0]);
    expect(prompt.system).not.toContain("旧偏好");
    expect(prompt.system).not.toContain("旧行动");
    expect(prompt.system).not.toContain("当前状态（暂时工作假设）");
  });

  it("uses the 鹿禅 identity and injects one story only when explicitly requested", () => {
    const ordinary = composeCharacterPrompt({ plan, state, style, memories: [], recentContext: [], userText: "今天还是很累" });
    expect(ordinary.system).toContain("名为鹿禅");
    expect(ordinary.system).toContain("tata 是另一位水獭角色，飞儿是另一位飞鸟信差");
    expect(ordinary.system).toContain("优先让一个禅宗观照进入回应");
    expect(ordinary.system).toContain("不得使用 tata 的温软昵称");
    expect(ordinary.system).not.toContain("用户主动请求的禅宗故事");

    const story = composeCharacterPrompt({ plan, state, style, memories: [], recentContext: [], userText: "讲一个关于执念的禅宗故事" });
    expect(story.system).toContain("用户主动请求的禅宗故事");
    expect(story.system).toContain("指月");
  });
});
