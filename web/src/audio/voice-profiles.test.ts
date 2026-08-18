import { describe, expect, it } from "vitest";
import { resolveVoiceProfile, validateVoiceProfileRegistry, voiceProfileRegistry } from "./voice-profiles";

describe("voice profile registry", () => {
  it("contains every required spirit otter profile", () => {
    expect(() => validateVoiceProfileRegistry()).not.toThrow();
    expect(Object.keys(voiceProfileRegistry.spirit_otter)).toEqual([
      "spirit_otter.deep_tide", "spirit_otter.shore_pick", "spirit_otter.safety_plain",
    ]);
  });

  it("keeps one voice preference and varies prosody", () => {
    const deep = resolveVoiceProfile("spirit_otter", "spirit_otter.deep_tide");
    const shore = resolveVoiceProfile("spirit_otter", "spirit_otter.shore_pick");
    expect(deep.preferredVoiceNames).toBe(shore.preferredVoiceNames);
    expect(deep.rate).toBeLessThan(shore.rate);
  });

  it("falls back to deep tide for an unknown profile", () => {
    expect(resolveVoiceProfile("spirit_otter", "unknown").id).toBe("spirit_otter.deep_tide");
  });
});
