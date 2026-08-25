import { describe, expect, it } from "vitest";
import { resolveVoiceProfile, validateVoiceProfileRegistry, voiceProfileRegistry } from "./voice-profiles";

describe("voice profile registry", () => {
  it("contains complete and distinct profiles for every public agent", () => {
    expect(() => validateVoiceProfileRegistry()).not.toThrow();
    expect(Object.keys(voiceProfileRegistry)).toEqual(["zen_deer", "spirit_otter", "bird_courier"]);
    expect(Object.keys(voiceProfileRegistry.zen_deer)).toEqual(["zen_deer.deep_tide", "zen_deer.shore_pick", "zen_deer.safety_plain"]);
  });

  it("keeps one low male voice preference and varies slow prosody", () => {
    const deep = resolveVoiceProfile("zen_deer", "zen_deer.deep_tide");
    const shore = resolveVoiceProfile("zen_deer", "zen_deer.shore_pick");
    expect(deep.preferredVoiceNames).toBe(shore.preferredVoiceNames);
    expect(deep.preferredVoiceNames).toContain("Yunjian");
    expect(deep.rate).toBeLessThan(shore.rate);
    expect(deep.pitch).toBeLessThan(shore.pitch);
    expect(shore.rate).toBeLessThan(1);
    expect(shore.pitch).toBeLessThan(1);
  });

  it("separates tata warmth from Feier crispness", () => {
    const tata = resolveVoiceProfile("spirit_otter", "spirit_otter.warm_companion");
    const feier = resolveVoiceProfile("bird_courier", "bird_courier.concierge");
    expect(tata.preferredVoiceNames).toContain("Xiaoxiao");
    expect(feier.preferredVoiceNames).toContain("Xiaoyi");
    expect(tata.rate).toBeLessThan(feier.rate);
    expect(tata.pitch).toBeLessThan(feier.pitch);
  });

  it("falls back to the selected agent's default profile", () => {
    expect(resolveVoiceProfile("zen_deer", "unknown").id).toBe("zen_deer.deep_tide");
    expect(resolveVoiceProfile("spirit_otter", "unknown").id).toBe("spirit_otter.warm_companion");
    expect(resolveVoiceProfile("bird_courier", "unknown").id).toBe("bird_courier.concierge");
  });
});
