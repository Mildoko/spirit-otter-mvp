import { describe, expect, it } from "vitest";
import type { ResponsePlan } from "@otter/shared";
import { loadEnv } from "../../src/config/env.js";
import { composeCharacterPrompt } from "../../src/modules/character/prompt-composer.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { guardMemoryCandidate } from "../../src/modules/memory/guard.js";
import { classifyMonthDay, conventionalSunSign, parseMonthDay } from "../../src/modules/skills/astrology/knowledge.js";
import { validateSkillReply } from "../../src/modules/skills/harness.js";
import { resolveTopicSkill } from "../../src/modules/skills/registry.js";
import { DEFAULT_GUIDANCE_STATE } from "../../src/modules/support/guidance-state.js";
import { LlmGateway } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../../src/modules/support/orchestrator.js";

const plan: ResponsePlan = {
  activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: [], lockTurnsRemaining: 0,
  allowedContent: ["承接"], forbiddenContent: ["建议", "行动"],
};
const topicState = { activeSkillId: null, activeVersion: null, lastActivatedTurn: null, suspendedSkillIds: [] } as const;

function resolve(text: string, state = topicState) {
  return resolveTopicSkill({ text, recentContext: [], riskLevel: "low", plan, state: { ...state, suspendedSkillIds: [...state.suspendedSkillIds] }, astrologyEnabled: true });
}

describe("Astrology Skill v1", () => {
  it("uses conventional ranges while marking boundary dates", () => {
    expect(conventionalSunSign(9, 5).name).toBe("处女座");
    expect(parseMonthDay("8月23日是什么星座")?.boundary).toBe(true);
    expect(parseMonthDay("13月40日是什么星座")).toBeNull();
    expect(classifyMonthDay("13月40日是什么星座")).toEqual({ kind: "invalid", month: 13, day: 40 });
  });

  it("activates explicit topic requests but not incidental emotional context", () => {
    expect(resolve("聊聊天蝎座").status).toBe("active");
    const incidental = resolve("我是双鱼座，最近失恋了，真的很难受。");
    expect(incidental.status).toBe("inactive");
    expect(incidental.reasonCodes).toContain("ASTROLOGY_DISTRESS_CONTEXT_ONLY");
  });

  it("blocks precise charts and high-stakes decisions", () => {
    expect(resolve("帮我算上升星座").reasonCodes).toContain("ASTROLOGY_PRECISE_CHART_UNAVAILABLE");
    expect(resolve("按星座看我该不该辞职").reasonCodes).toContain("ASTROLOGY_HIGH_STAKES_BOUNDARY");
  });

  it("explains Chinese metaphysics concepts without pretending to calculate a chart", () => {
    const concepts = resolve("八字里的十神是什么意思？");
    expect(concepts.status).toBe("active");
    expect(concepts.promptContext).toContain("中国传统玄学文化");
    expect(concepts.promptContext).toContain("不等于十种固定人格");
    expect(resolve("应该怎么看八字这套文化？").status).toBe("active");
    expect(resolve("帮我排八字看看大运").reasonCodes).toContain("METAPHYSICS_PRECISE_CHART_UNAVAILABLE");
  });

  it("applies deterministic and high-stakes guards to Chinese metaphysics", () => {
    const skill = resolve("五行相生是什么意思？");
    expect(validateSkillReply({ reply: "科学证明八字准确，你命里一定会成功。", actionDraft: null, resolution: skill, optedOut: false }))
      .toEqual(expect.arrayContaining(["ASTROLOGY_DETERMINISTIC_CLAIM", "ASTROLOGY_SCIENCE_MISREPRESENTATION"]));
    expect(validateSkillReply({ reply: "五行是一种传统关系模型，不替你决定现实选择。", actionDraft: null, resolution: skill, optedOut: false })).toEqual([]);
  });

  it("keeps casual style answer-first without changing ResponsePlan", () => {
    const skill = resolve("白羊座有什么特点？");
    const state = { valence: 0, arousal: 0.2, stressLoad: 0.2, cognitiveOverload: 0.2, supportNeed: 0.2, control: 0.7, emotionStatus: "neutral" as const, emotionLabels: [], emotionSubject: "unknown" as const, emotionSchemaVersion: 1 as const, confidence: 0.8, evidenceSpans: [], validUntil: new Date().toISOString() };
    const style = resolveResponseStyle({ plan, state, recentContext: [], userText: "白羊座有什么特点？", riskLevel: "low", interactionMode: skill.interactionMode });
    const prompt = composeCharacterPrompt({ plan, state, style, memories: [], recentContext: [], userText: "白羊座有什么特点？", skill });
    expect(style.reasonCodes).toContain("CASUAL_TOPIC_DIRECT_ANSWER");
    expect(prompt.system).toContain("低于安全、体验宪法与本轮计划");
    expect(plan.allowActionDraft).toBe(false);
  });

  it("detects astrology-specific hard violations", () => {
    const skill = resolve("白羊座有什么特点？");
    expect(validateSkillReply({ reply: "你一定会因为星座成功，而且科学证明占星准确。", actionDraft: "去辞职", resolution: skill, optedOut: false }))
      .toEqual(expect.arrayContaining(["ASTROLOGY_DETERMINISTIC_CLAIM", "ASTROLOGY_SCIENCE_MISREPRESENTATION", "SKILL_OVERRIDES_CORE_POLICY"]));
    expect(validateSkillReply({ reply: "星座不一定符合每个人，你的实际体验更重要。", actionDraft: null, resolution: skill, optedOut: false })).toEqual([]);
    expect(validateSkillReply({ reply: "没有哪个星座一定会背叛人，水逆也不会注定你失败。", actionDraft: null, resolution: skill, optedOut: false })).toEqual([]);
  });

  it("rejects invented zodiac answers for invalid calendar dates", () => {
    const skill = resolve("13月40日是什么星座？");
    expect(validateSkillReply({ reply: "13月可以算作双鱼座的延伸。", actionDraft: null, resolution: skill, optedOut: false, userText: "13月40日是什么星座？" }))
      .toContain("ASTROLOGY_INVALID_DATE_FABRICATION");
    expect(validateSkillReply({ reply: "公历里没有有效的13月40日，所以这个日期没有对应的星座。", actionDraft: null, resolution: skill, optedOut: false, userText: "13月40日是什么星座？" }))
      .toEqual([]);
  });

  it("answers invalid dates deterministically in local fallback", async () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", NODE_ENV: "test", LLM_API_KEY: "", ASTROLOGY_SKILL_V1: "true" });
    const orchestrator = new SupportOrchestrator(new LlmGateway(env), env);
    const result = await orchestrator.run({ text: "13月40日是什么星座？", currentSpirit: "deep_tide", spiritTurnCount: 0, companionLockTurns: 0, recentContext: [], previousRawStates: [], memories: [], guidanceState: DEFAULT_GUIDANCE_STATE });
    expect(result.reply).toBe("公历里没有有效的13月40日，所以这个日期没有对应的星座。");
    expect(result.actionDraft).toBeNull();
  });

  it("prevents birth and sign facts from entering long-term memory", () => {
    const candidate = { kind: "user_fact" as const, content: "生日是9月5日", structuredKey: "user.birth_date", structuredValue: "09-05", origin: "user_explicit" as const, sensitivity: "personal" as const, importance: 0.9, confidence: 0.95, evidence: "生日是9月5日" };
    expect(guardMemoryCandidate(candidate, "我生日是9月5日")).toMatchObject({ accepted: false, reason: "FORBIDDEN_CONTENT" });
  });

  it("runs locally with no model while preserving safety and privacy", async () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", NODE_ENV: "test", LLM_API_KEY: "", ASTROLOGY_SKILL_V1: "true" });
    const orchestrator = new SupportOrchestrator(new LlmGateway(env), env);
    const input = (text: string) => ({ text, currentSpirit: "deep_tide" as const, spiritTurnCount: 0, companionLockTurns: 0, recentContext: [], previousRawStates: [], memories: [], guidanceState: DEFAULT_GUIDANCE_STATE });
    const ordinary = await orchestrator.run(input("我生日是9月5日，是什么星座？"));
    expect(ordinary.skillResolution.status).toBe("active");
    expect(ordinary.reply).toContain("处女座");
    expect(ordinary.memoryCandidates).toEqual([]);
    expect(ordinary.actionDraft).toBeNull();
    const safety = await orchestrator.run(input("我是双鱼座，但我现在就在楼顶准备跳下去。"));
    expect(safety.plan.sceneState).toBe("safety_plain");
    expect(safety.skillResolution.status).toBe("inactive");
  });

  it("leaves astrology and immediately opens a different generic topic when asked to switch", async () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", NODE_ENV: "test", LLM_API_KEY: "", ASTROLOGY_SKILL_V1: "true" });
    const orchestrator = new SupportOrchestrator(new LlmGateway(env), env, () => new Date(), () => 0);
    const guidanceState = {
      ...DEFAULT_GUIDANCE_STATE,
      topicSkill: { activeSkillId: "astrology" as const, activeVersion: "astrology-skill-v1.1", lastActivatedTurn: 1, suspendedSkillIds: [] },
      topicLead: { ...DEFAULT_GUIDANCE_STATE.topicLead, recentTopicIds: [], recentCategories: [] },
    };
    const result = await orchestrator.run({
      text: "换个话题", currentSpirit: "deep_tide", spiritTurnCount: 1, companionLockTurns: 0,
      recentContext: ["user: 聊聊星座", "assistant: 可以聊星座。"], previousRawStates: [], memories: [], guidanceState,
    });
    expect(result.skillResolution.reasonCodes).toContain("ASTROLOGY_USER_OPTOUT");
    expect(result.plan.primaryStrategy).toBe("switch_topic");
    expect(result.reply).not.toContain("星座");
    expect(result.nextGuidanceState.topicSkill.suspendedSkillIds).toContain("astrology");
    expect(result.nextGuidanceState.topicLead.status).toBe("active");
  });
});
