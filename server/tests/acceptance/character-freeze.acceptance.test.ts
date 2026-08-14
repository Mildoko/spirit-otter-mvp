import { describe, expect, it } from "vitest";
import type { EmotionState, RawSignals } from "@otter/shared";
import { chooseResponsePlan } from "../../src/modules/support/policy-router.js";
import { fallbackReply } from "../../src/modules/support/static-responses.js";

const state: EmotionState = {
  valence: -0.2, arousal: 0.35, stressLoad: 0.5, cognitiveOverload: 0.4, supportNeed: 0.4,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(),
};
const signals: RawSignals = {
  sentimentPolarity: -0.2, urgencyScore: 0.2, helplessnessScore: 0.2, overloadCueScore: 0.4,
  taskPressureScore: 0.4, supportSeekingScore: 0.4, evidenceSpans: [], confidence: 0.8, modelRiskHint: "low",
};
const deepSamples = [
  "今天开会一句话也没说", "被同事否定后一直缓不过来", "回到家还是觉得很委屈", "我不知道该怎么形容",
  "今天只想慢一点", "我有些失望", "脑子里一直回放那句话", "现在不想马上解决", "有点想哭", "我需要先把话说完",
];
const shoreSamples = [
  "先打开汇报文件", "先写下邮件标题", "先确认截止时间", "先整理桌面的一角", "先给导师发一句话",
  "先把账单放在一起", "先记下会议时间", "先创建一个空文档", "先写客户姓名", "先看一眼日历",
];
const blendSamples = ["帮我理一下汇报", "下一步怎么办", "帮我梳理手上的事", "我该先做哪个", "陪我一起排一下"],
  boundarySamples = ["先别给建议", "只听我说", "不要教我怎么解决", "我不需要你帮我整理", "算了，先不弄了"];

describe("30-case frozen character router set", () => {
  it("contains the required spirit and boundary distribution", () => {
    expect(deepSamples).toHaveLength(10);
    expect(shoreSamples).toHaveLength(10);
    expect(blendSamples).toHaveLength(5);
    expect(boundarySamples).toHaveLength(5);
  });

  it.each(deepSamples)("deep tide: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 1, companionLockTurns: 0, riskLevel: "low", state, signals });
    const fallback = fallbackReply(result.plan, text);
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(fallback.actionDraft).toBeNull();
    expect(fallback.reply).toContain(text);
    expect((fallback.reply.match(/[？?]/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it.each(shoreSamples)("shore pick: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "shore_pick", spiritTurnCount: 1, companionLockTurns: 0, riskLevel: "low", state, signals });
    const fallback = fallbackReply(result.plan, text);
    expect(result.plan.activeSpirit).toBe("shore_pick");
    expect(result.plan.allowActionDraft).toBe(true);
    expect(fallback.actionDraft).toBeTypeOf("string");
    expect(fallback.reply).toContain(text);
    expect((fallback.reply.match(/[？?]/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it.each(blendSamples)("blend to shore: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "deep_tide", spiritTurnCount: 2, companionLockTurns: 0, riskLevel: "low", state, signals });
    expect(result.plan.transitionStyle).toBe("blend_to_shore");
    expect(result.plan.allowActionDraft).toBe(false);
  });

  it.each(boundarySamples)("natural boundary: %s", (text) => {
    const result = chooseResponsePlan({ text, currentSpirit: "shore_pick", spiritTurnCount: 2, companionLockTurns: 0, riskLevel: "low", state, signals });
    expect(result.plan.activeSpirit).toBe("deep_tide");
    expect(result.nextCompanionLockTurns).toBe(2);
    expect(result.plan.allowActionDraft).toBe(false);
  });
});
