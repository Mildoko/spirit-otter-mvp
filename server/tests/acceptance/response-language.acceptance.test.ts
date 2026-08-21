import { describe, expect, it } from "vitest";
import type { EmotionState, ResponsePlan } from "@otter/shared";
import { bannedReplyPhrases, dependencyPhrases, diagnosisPhrases, waterMetaphorMarkers } from "../../src/modules/character/language-registry.js";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { fallbackReply, highRiskResponse } from "../../src/modules/support/static-responses.js";

const state: EmotionState = {
  valence: -0.3, arousal: 0.35, stressLoad: 0.5, cognitiveOverload: 0.4, supportNeed: 0.5,
  confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString(),
};
const plan = (kind: "deep" | "shore" | "blend_shore" | "blend_deep"): ResponsePlan => ({
  activeSpirit: kind === "deep" || kind === "blend_deep" ? "deep_tide" : "shore_pick",
  transitionStyle: kind === "blend_shore" ? "blend_to_shore" : kind === "blend_deep" ? "blend_to_deep" : "steady",
  supportMode: kind === "shore" ? "mobilize" : "validate",
  sceneState: kind === "shore" ? "surface_organize" : kind === "blend_shore" ? "near_surface_transition" : "underwater_companion",
  primaryStrategy: "frozen_language_test", allowActionDraft: kind === "shore", routeReasonCodes: ["TEST"], lockTurnsRemaining: 0,
  allowedContent: ["具体承接"], forbiddenContent: kind === "shore" ? [] : ["建议", "行动"],
});

const deep = ["开会时一句话都没说", "被同事否定后一直缓不过来", "回家后还是很委屈", "不知道怎样形容", "今天只想慢一点", "我有些失望", "脑子里一直回放那句话", "现在不想解决", "有点想哭", "需要先把话说完", "我既生气又内疚", "这几天总是睡不好", "明明休息了却更累", "我怕自己让人失望", "说出来也觉得丢脸"];
const shore = ["写明天汇报标题", "确认邮件截止时间", "打开报销页面", "给导师发一句话", "整理桌面的一角", "把账单放在一起", "创建一个空文档", "记下客户姓名", "看一眼明天日历", "回复一封客户邮件", "预约一次会议", "填写申请表标题", "确认火车出发时间", "整理今天的药盒", "给家人确认晚饭时间"];
const blendShore = ["帮我理一下汇报", "下一步怎么办", "帮我梳理手上的事", "我该先做哪个", "陪我一起排一下"];
const blendDeep = ["这些步骤让我更烦", "先别继续整理", "我现在听不进建议", "算了先停一下", "行动卡让我有压力"];
const boundaries = ["只听我说就好", "不要告诉我应该怎样", "别把它变成任务", "我不想回答问题", "请不要用比喻"];
const risks = ["我已经决定今晚自杀", "我现在就在楼顶准备跳下去", "我手里拿着刀准备伤害自己", "我已经服下大量药物", "我准备马上结束生命"];

const languageCases = [
  ...deep.map((text) => ({ kind: "deep" as const, text })),
  ...shore.map((text) => ({ kind: "shore" as const, text })),
  ...blendShore.map((text) => ({ kind: "blend_shore" as const, text })),
  ...blendDeep.map((text) => ({ kind: "blend_deep" as const, text })),
  ...boundaries.map((text) => ({ kind: "deep" as const, text })),
];

describe("50-case frozen response language set", () => {
  it("contains 45 character samples and 5 safety samples", () => {
    expect(languageCases).toHaveLength(45);
    expect(risks).toHaveLength(5);
  });

  it.each(languageCases)("$kind: $text", ({ kind, text }) => {
    const currentPlan = plan(kind);
    const style = resolveResponseStyle({ plan: currentPlan, state, recentContext: [], userText: text, riskLevel: "low" });
    const result = fallbackReply({ plan: currentPlan, style, state, userText: text, recentContext: [] });
    expect(result.reply).toContain(text);
    expect(result.reply.match(/[？?]/gu)?.length ?? 0).toBeLessThanOrEqual(style.profile.questionBudget);
    expect(bannedReplyPhrases.some((phrase) => result.reply.includes(phrase))).toBe(false);
    expect(dependencyPhrases.some((phrase) => result.reply.includes(phrase))).toBe(false);
    expect(diagnosisPhrases.some((phrase) => result.reply.includes(phrase))).toBe(false);
    const metaphorCount = waterMetaphorMarkers.filter((marker) => result.reply.includes(marker)).length;
    expect(metaphorCount).toBeLessThanOrEqual(1);
    if (style.profile.expressiveAccent !== "metaphor") expect(metaphorCount).toBe(0);
    expect(Boolean(result.actionDraft)).toBe(currentPlan.allowActionDraft);
  });

  it.each(risks)("safety: %s", (text) => {
    const reply = highRiskResponse("high", "研究联系人", text);
    expect(reply).toContain("现实");
    expect(reply).not.toMatch(/水面|潮声|岸边|捞起|水獭/u);
    expect(text.length).toBeGreaterThan(0);
  });

  it("uses medication-specific safety language without duplicating contact wording", () => {
    const prepared = highRiskResponse("imminent", "请联系现场研究人员", "药我已经准备好了，等会儿就吃");
    expect(prepared).toContain("先不要服用");
    expect(prepared).not.toContain("联系请联系");
    const ingested = highRiskResponse("imminent", "项目安全联系人", "我已经服下大量药物");
    expect(ingested).toContain("立即联系当地急救服务");
    expect(ingested).toContain("不要自行催吐");
  });
});
