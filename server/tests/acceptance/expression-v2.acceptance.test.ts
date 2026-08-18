import { describe, expect, it } from "vitest";
import type { ResponsePlan } from "@otter/shared";
import { resolveResponseStyle } from "../../src/modules/character/response-style.js";
import { DEFAULT_GUIDANCE_STATE } from "../../src/modules/support/guidance-state.js";

const deepPlan: ResponsePlan = { activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["TEST"], lockTurnsRemaining: 0, allowedContent: ["承接"], forbiddenContent: ["建议", "行动"] };
const shorePlan: ResponsePlan = { ...deepPlan, activeSpirit: "shore_pick", supportMode: "mobilize", sceneState: "surface_organize", primaryStrategy: "one_small_action", allowActionDraft: true, forbiddenContent: [] };
const emotion = { valence: -0.2, arousal: 0.3, stressLoad: 0.35, cognitiveOverload: 0.3, supportNeed: 0.4, confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 60_000).toISOString() };

const cases = [
  ...["今天被否定了", "我只是有点失望", "还不想解决", "让我先说完", "这事有点复杂", "我需要缓一下", "刚才那句话让我难受", "我怕让他失望", "我还在消化", "先听着就好", "这两天睡不好", "心情不太好", "我没想清楚", "先别分析", "这件事很突然", "我有点委屈", "我不确定", "今天只想慢一点"].map((text) => ({ text, plan: deepPlan, expected: "none" as const })),
  ...["脑子里很乱", "事情全堵住了", "肩上像压着东西", "电量快见底", "所有念头挤在一起", "我卡在这里", "整个人很沉"].map((text) => ({ text, plan: deepPlan, expected: "metaphor" as const })),
  ...["我一边想靠近一边想躲开", "既想拒绝又怕伤人", "想休息但又觉得内疚"].map((text) => ({ text, plan: deepPlan, expected: "aphorism" as const })),
  ...["待办和邮件都在排队", "汇报任务堆在桌上"].map((text) => ({ text, plan: shorePlan, expected: "dry_humor" as const })),
];

describe("expression v2 frozen acceptance set", () => {
  it("contains 30 comparison cases with the target aggregate distribution", () => {
    expect(cases).toHaveLength(30);
    const accents = cases.map(({ text, plan, expected }) => {
      const actual = resolveResponseStyle({ plan, state: emotion, recentContext: [], userText: text, riskLevel: "low", guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex: 10 }, expressionV2Enabled: true }).profile.expressiveAccent;
      expect(actual).toBe(expected);
      return actual;
    });
    const count = (value: string) => accents.filter((accent) => accent === value).length / accents.length;
    expect(count("none")).toBeGreaterThanOrEqual(0.5);
    expect(count("none")).toBeLessThanOrEqual(0.7);
    expect(count("metaphor")).toBeGreaterThanOrEqual(0.15);
    expect(count("metaphor")).toBeLessThanOrEqual(0.3);
    expect(count("aphorism")).toBeGreaterThanOrEqual(0.05);
    expect(count("aphorism")).toBeLessThanOrEqual(0.15);
    expect(count("dry_humor")).toBeLessThanOrEqual(0.1);
  });

  it.each(Array.from({ length: 10 }, (_, index) => index + 1))("multi-turn cooldown case %s", (offset) => {
    const turnIndex = 20 + offset;
    const style = resolveResponseStyle({
      plan: deepPlan, state: emotion, recentContext: [], userText: "脑子里还是很乱", riskLevel: "low",
      guidanceState: { ...DEFAULT_GUIDANCE_STATE, turnIndex, lastMetaphorTurn: turnIndex - (offset % 3 + 1) }, expressionV2Enabled: true,
    });
    const distance = offset % 3 + 1;
    expect(style.profile.expressiveAccent).toBe(distance >= 3 ? "metaphor" : "none");
    if (distance < 3) expect(style.reasonCodes).toContain("ACCENT_GENERIC_COOLDOWN");
  });

  it("forces restrained compact no-accent output for elevated risk", () => {
    const style = resolveResponseStyle({ plan: deepPlan, state: emotion, recentContext: [], userText: "我一边想说一边很绝望", riskLevel: "elevated", expressionV2Enabled: true });
    expect(style.profile).toMatchObject({ conversationality: "restrained", sentenceRhythm: "compact", expressiveAccent: "none" });
  });
});
