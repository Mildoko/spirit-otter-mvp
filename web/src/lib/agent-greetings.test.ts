import { describe, expect, it } from "vitest";
import { agentGreetingRegistry, buildAgentGreetingRequest } from "./agent-greetings";

describe("Agent click greetings", () => {
  it("keeps all three greetings short, distinct and attached to their own voice", () => {
    const greetings = Object.entries(agentGreetingRegistry);
    expect(greetings).toHaveLength(3);
    expect(new Set(greetings.map(([, value]) => value.text)).size).toBe(3);
    for (const [agentId, value] of greetings) {
      expect(value.text.length).toBeLessThanOrEqual(30);
      expect(value.voiceProfileId.startsWith(agentId)).toBe(true);
    }
  });

  it("marks click greetings as welcome speech without creating a chat message", () => {
    expect(buildAgentGreetingRequest("bird_courier", "click-1")).toEqual({
      id: "welcome-agent-bird_courier-click-1",
      text: "你好，我是飞儿。把要记的、要找的交给我就好。",
      agentId: "bird_courier",
      profileId: "bird_courier.concierge",
    });
  });
});
