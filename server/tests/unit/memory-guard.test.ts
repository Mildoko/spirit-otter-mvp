import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@otter/shared";
import { filterMemoryCandidates, guardMemoryCandidate } from "../../src/modules/memory/guard.js";

const candidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  kind: "user_preference",
  content: "更喜欢一次只问一个问题",
  structuredKey: "conversation.question_count",
  structuredValue: "one",
  origin: "user_explicit",
  sensitivity: "normal",
  importance: 0.8,
  confidence: 0.9,
  evidence: "我更喜欢一次只问一个问题",
  ...overrides,
});

describe("deterministic memory guard", () => {
  it("accepts ordinary explicit information with verbatim evidence", () => {
    expect(guardMemoryCandidate(candidate(), "我更喜欢一次只问一个问题").accepted).toBe(true);
  });

  it("rejects paraphrased or fabricated evidence", () => {
    expect(guardMemoryCandidate(candidate(), "我喜欢你慢一点说")).toEqual({ accepted: false, reason: "EVIDENCE_NOT_VERBATIM" });
  });

  it.each([
    ["diagnosis", { content: "用户确诊抑郁症", evidence: "确诊抑郁症" }, "我被确诊抑郁症"],
    ["credential", { content: "API key 是 credential-value", evidence: "credential-value" }, "我的 API key 是 credential-value"],
    ["dependency", { content: "用户只有澜泊能理解", evidence: "只有澜泊能理解" }, "只有澜泊能理解我"],
    ["high-risk", { content: "用户想要自杀", evidence: "想要自杀" }, "我现在想要自杀"],
    ["sensitive-category", { content: "用户的宗教信仰", evidence: "宗教信仰" }, "我想谈谈自己的宗教信仰"],
    ["sensitive", { sensitivity: "sensitive", evidence: "这是一件敏感事情" }, "这是一件敏感事情"],
  ])("rejects %s memory", (_name, overrides, text) => {
    expect(guardMemoryCandidate(candidate(overrides as Partial<MemoryCandidate>), text).accepted).toBe(false);
  });

  it("allows inference only for event or relationship milestones at higher thresholds", () => {
    expect(guardMemoryCandidate(candidate({ origin: "model_inference" }), "我更喜欢一次只问一个问题").reason).toBe("INFERENCE_KIND_BLOCKED");
    expect(guardMemoryCandidate(candidate({
      kind: "episode",
      origin: "model_inference",
      importance: 0.8,
      confidence: 0.9,
    }), "我更喜欢一次只问一个问题").accepted).toBe(true);
  });

  it("caps accepted candidates at two", () => {
    const text = "甲乙丙";
    const items = ["甲", "乙", "丙"].map((evidence, index) => candidate({
      kind: "episode",
      content: `事件内容${evidence}${index}`,
      structuredKey: `episode.${index}`,
      evidence,
    }));
    expect(filterMemoryCandidates(items, text)).toHaveLength(2);
  });
});
