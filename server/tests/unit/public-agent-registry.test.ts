import { describe, expect, it } from "vitest";
import { publicAgentRegistry, validatePublicAgentRegistry } from "../../src/modules/character/public-agent-registry.js";

describe("three public agent character registry", () => {
  it("keeps 鹿禅, tata and 飞儿 strictly distinct", () => {
    expect(() => validatePublicAgentRegistry()).not.toThrow();
    expect(Object.keys(publicAgentRegistry)).toEqual(["zen_deer", "spirit_otter", "bird_courier"]);
    expect(publicAgentRegistry.zen_deer.species).toBe("鹿灵");
    expect(publicAgentRegistry.spirit_otter.species).toBe("水獭");
    expect(publicAgentRegistry.bird_courier.species).toBe("飞鸟信差");
  });

  it("gives every agent an explicit anti-borrowing boundary", () => {
    expect(publicAgentRegistry.zen_deer.forbiddenBorrowing.join(" ")).toContain("tata");
    expect(publicAgentRegistry.spirit_otter.forbiddenBorrowing.join(" ")).toContain("公案");
    expect(publicAgentRegistry.bird_courier.forbiddenBorrowing.join(" ")).toContain("哄慰");
  });
});
