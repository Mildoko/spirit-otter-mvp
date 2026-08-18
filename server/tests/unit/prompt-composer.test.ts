import { describe, expect, it } from "vitest";
import type { EmotionState, ResponsePlan } from "@otter/shared";
import { composeCharacterPrompt } from "../../src/modules/character/prompt-composer.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";

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
});
