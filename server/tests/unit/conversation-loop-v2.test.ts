import { describe, expect, it } from "vitest";
import type { EmotionState, GuidanceState } from "@otter/shared";
import { loadEnv } from "../../src/config/env.js";
import { LlmGateway } from "../../src/modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../../src/modules/support/orchestrator.js";
import { createDefaultGuidanceState } from "../../src/modules/support/guidance-state.js";

const env = loadEnv({
  NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused",
  SESSION_SECRET: "conversation-loop-v2-test-secret-long-enough", LLM_API_KEY: "",
});

const userTurns = [
  "不知道说什么",
  "心情不太好",
  "都不知道能和你聊啥，我待在这里干嘛？",
  "你的落空感是什么意思",
  "确实有这种感觉",
  "那我该怎么办呢",
  "把范围缩小吧",
  "隐隐在",
  "是的，那要怎么调整才能走出这种感觉",
  "范围缩小",
  "如何找到最常出现的时刻",
  "缩小",
  "感觉你一直在绕圈圈，这本身就让我有落空感",
  "你总是在重复同一句话，和你沟通好无聊",
  "这个话题好像和我无关",
  "你换的话题还是之前的话题，感觉你有点傻",
  "你的话题就只有广告吗",
] as const;

describe("collected conversation loop regression v2", () => {
  it("moves on advice and narrowing, repairs rupture, and truly switches rejected topics", async () => {
    const orchestrator = new SupportOrchestrator(new LlmGateway(env), env, () => new Date("2026-08-24T05:00:00Z"), () => 0);
    let guidance: GuidanceState = createDefaultGuidanceState();
    let currentSpirit = "deep_tide" as const;
    let spiritTurnCount = 0;
    let companionLockTurns = 0;
    let previousSmoothedState: EmotionState | undefined;
    const previousRawStates: EmotionState[] = [];
    const recentContext: string[] = [];
    const results: Array<Awaited<ReturnType<SupportOrchestrator["run"]>>> = [];

    for (const text of userTurns) {
      const result = await orchestrator.run({
        text, currentSpirit, spiritTurnCount, companionLockTurns, recentContext: [...recentContext],
        previousRawStates: [...previousRawStates], ...(previousSmoothedState ? { previousSmoothedState } : {}),
        memories: [], guidanceState: guidance,
      });
      results.push(result);
      recentContext.push(`user: ${text}`, `assistant: ${result.reply}`);
      while (recentContext.length > 12) recentContext.shift();
      previousRawStates.unshift(result.rawState);
      previousRawStates.splice(2);
      previousSmoothedState = result.state;
      guidance = result.nextGuidanceState;
      currentSpirit = result.plan.activeSpirit;
      spiritTurnCount = result.nextSpiritTurnCount;
      companionLockTurns = result.nextCompanionLockTurns;
    }

    expect(results[5]!.plan.primaryStrategy).toBe("answer_requested_advice");
    expect(results[6]!.plan.primaryStrategy).toBe("guided_narrowing");
    expect(results[8]!.plan.primaryStrategy).toBe("answer_requested_advice");
    expect(results[9]!.plan.primaryStrategy).toBe("guided_narrowing");
    expect(results[10]!.plan.primaryStrategy).toBe("answer_requested_advice");
    expect(results[11]!.plan.primaryStrategy).toBe("guided_narrowing");
    expect(results[12]!.plan.primaryStrategy).toMatch(/^rupture_/u);
    expect(results[13]!.plan.primaryStrategy).toMatch(/^rupture_/u);
    expect(results.map((result) => result.reply).join("\n")).not.toContain("最难的也许不只是事情本身，而是你已经没有多少余地继续承受它");

    const topicTurns = results.slice(14);
    expect(topicTurns.every((result) => result.plan.primaryStrategy === "switch_topic")).toBe(true);
    expect(new Set(topicTurns.map((result) => result.nextGuidanceState.topicLead.currentTopicId)).size).toBe(3);
    expect(new Set(topicTurns.map((result) => result.nextGuidanceState.topicLead.currentCategory)).size).toBe(3);
    expect(topicTurns.map((result) => result.reply).join("\n")).not.toMatch(/无聊背后|为什么无聊/u);
  });
});
