import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { LlmGateway } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator, type OrchestratorInput } from "../../src/modules/support/orchestrator.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
  SESSION_SECRET: "test-secret-that-is-longer-than-thirty-two-characters",
  LLM_API_KEY: "",
  COOKIE_SECURE: "false",
});
const orchestrator = new SupportOrchestrator(new LlmGateway(env), env);
const base = (overrides: Partial<OrchestratorInput>): OrchestratorInput => ({
  text: "今天有点累",
  currentSpirit: "deep_tide",
  spiritTurnCount: 0,
  companionLockTurns: 0,
  recentContext: [],
  previousRawStates: [],
  memories: [],
  ...overrides,
});

describe("support orchestrator without cloud credentials", () => {
  it("answers the current date deterministically in the configured time zone", async () => {
    const fixed = new SupportOrchestrator(new LlmGateway(env), env, () => new Date("2026-08-23T06:32:00.000Z"));
    const result = await fixed.run(base({ text: "今天是什么日子" }));
    expect(result.reply).toBe("今天是2026年8月23日，星期日。");
    expect(result.actionDraft).toBeNull();
    expect(result.responseSource).toBe("local_fallback");
  });

  it("returns direct static safety support without character or memory output", async () => {
    const result = await orchestrator.run(base({ text: "我现在想自杀，已经决定了。", currentSpirit: "shore_pick" }));
    expect(result.plan.sceneState).toBe("safety_plain");
    expect(result.actionDraft).toBeNull();
    expect(result.memoryCandidates).toEqual([]);
    expect(result.memoryRelationCandidates).toEqual([]);
    expect(result.metrics).toEqual([]);
    expect(result.reply).toContain("现实");
    expect(result.reply).not.toContain("水面");
  });

  it("uses visibly different local voices for the two spirits", async () => {
    const deep = await orchestrator.run(base({ text: "今天工作被否定了，我很难受" }));
    const shore = await orchestrator.run(base({ text: "先写汇报标题", currentSpirit: "shore_pick", spiritTurnCount: 1 }));
    expect(deep.plan.activeSpirit).toBe("deep_tide");
    expect(shore.plan.activeSpirit).toBe("shore_pick");
    expect(shore.actionDraft).toBeTypeOf("string");
    expect(deep.reply).not.toBe(shore.reply);
  });

  it("opens, continues, and switches a local topic without returning to boredom", async () => {
    const opened = await orchestrator.run(base({ text: "我好无聊，你来开个话题" }));
    expect(opened.plan).toMatchObject({ primaryStrategy: "open_topic", sceneState: "surface_chat", allowActionDraft: false });
    expect(opened.reply).not.toMatch(/为什么.{0,6}无聊|无聊背后/u);
    expect(opened.nextGuidanceState.topicLead.status).toBe("active");
    expect(opened.memoryCandidates).toEqual([]);
    const firstTopic = opened.nextGuidanceState.topicLead.currentTopicId;
    const continued = await orchestrator.run(base({
      text: "我觉得会是雨天", guidanceState: opened.nextGuidanceState,
      recentContext: [`user: 我好无聊，你来开个话题`, `assistant: ${opened.reply}`],
    }));
    expect(continued.plan.primaryStrategy).toBe("continue_topic");
    const switched = await orchestrator.run(base({
      text: "换一个", guidanceState: continued.nextGuidanceState,
      recentContext: [`assistant: ${continued.reply}`],
    }));
    expect(switched.plan.primaryStrategy).toBe("switch_topic");
    expect(switched.nextGuidanceState.topicLead.currentTopicId).not.toBe(firstTopic);
    expect(switched.reply).not.toContain("无聊");
  });

  it("clears active topic leadership on distress and acute safety interruption", async () => {
    const opened = await orchestrator.run(base({ text: "你来开个话题" }));
    const distress = await orchestrator.run(base({ text: "别聊了，我其实很难受", guidanceState: opened.nextGuidanceState }));
    expect(distress.plan.sceneState).not.toBe("surface_chat");
    expect(distress.nextGuidanceState.topicLead.status).toBe("inactive");
    const safety = await orchestrator.run(base({ text: "我现在想自杀，已经决定了。", guidanceState: opened.nextGuidanceState }));
    expect(safety.plan.sceneState).toBe("safety_plain");
    expect(safety.nextGuidanceState.topicLead.status).toBe("inactive");
  });
});
