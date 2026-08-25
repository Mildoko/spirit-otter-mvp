import { describe, expect, it } from "vitest";
import { composePublicAgentPrompt, publicAgentFallbackReply, validatePublicAgentReply } from "../../src/modules/character/public-agent-prompt.js";

describe("public agent runtime prompts", () => {
  it("keeps tata warm and blocks deer or concierge borrowing", () => {
    const prompt = composePublicAgentPrompt({ agentId: "spirit_otter", userText: "今天很累", recentContext: [] });
    expect(prompt.system).toContain("名字=tata");
    expect(prompt.system).toContain("不讲禅宗公案");
    expect(publicAgentFallbackReply("spirit_otter", "今天很累")).toContain("消耗");
    expect(validatePublicAgentReply("spirit_otter", "禅门有一则公案。", null)).toBe(false);
  });

  it("keeps 飞儿 precise and never claims unauthorized persistence or social actions", () => {
    const prompt = composePublicAgentPrompt({ agentId: "bird_courier", userText: "我喜欢摄影", recentContext: [] });
    expect(prompt.system).toContain("名字=飞儿");
    expect(prompt.system).toContain("必须分别获得用户明确授权");
    expect(publicAgentFallbackReply("bird_courier", "我喜欢摄影")).toContain("不会直接");
    expect(validatePublicAgentReply("bird_courier", "已经记入兴趣，顺便替你报名。", null)).toBe(false);
    expect(validatePublicAgentReply("bird_courier", "我先把时间和预算收清楚；保存前会再问你。", null)).toBe(true);
  });
});
