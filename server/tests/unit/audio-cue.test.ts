import { describe, expect, it } from "vitest";
import { buildAudioCue, publicAgentIds, serverVoiceProfileRegistry, validateServerVoiceProfileRegistry } from "../../src/modules/support/audio-cue.js";

describe("audio cue", () => {
  it("keeps every public agent registered", () => {
    expect(() => validateServerVoiceProfileRegistry()).not.toThrow();
    expect(Object.keys(serverVoiceProfileRegistry)).toEqual(publicAgentIds);
  });

  it.each([
    ["deep_tide", "zen_deer.deep_tide"],
    ["shore_pick", "zen_deer.shore_pick"],
  ] as const)("maps %s to its voice profile", (activeSpirit, voiceProfileId) => {
    expect(buildAudioCue({ riskLevel: "low", activeSpirit, hasActionDraft: false })).toEqual({
      schemaVersion: 1,
      agentId: "zen_deer",
      voiceProfileId,
      sfx: "reply_ripple",
      soundscapePolicy: "normal",
    });
  });

  it("uses the invitation sound for action drafts", () => {
    expect(buildAudioCue({ riskLevel: "low", activeSpirit: "shore_pick", hasActionDraft: true }).sfx).toBe("invite_chime");
  });

  it("uses the explicitly selected tata and 飞儿 voice families", () => {
    expect(buildAudioCue({ agentId: "spirit_otter", riskLevel: "low", activeSpirit: "deep_tide", hasActionDraft: false })).toMatchObject({
      agentId: "spirit_otter", voiceProfileId: "spirit_otter.warm_companion",
    });
    expect(buildAudioCue({ agentId: "bird_courier", riskLevel: "low", activeSpirit: "shore_pick", hasActionDraft: false })).toMatchObject({
      agentId: "bird_courier", voiceProfileId: "bird_courier.recommendation",
    });
  });

  it("reduces elevated risk and silences high/imminent decoration", () => {
    expect(buildAudioCue({ riskLevel: "elevated", activeSpirit: "deep_tide", hasActionDraft: true })).toMatchObject({
      voiceProfileId: "zen_deer.safety_plain", sfx: "none", soundscapePolicy: "reduced",
    });
    for (const riskLevel of ["high", "imminent"] as const) {
      expect(buildAudioCue({ riskLevel, activeSpirit: "shore_pick", hasActionDraft: true })).toMatchObject({
        voiceProfileId: "zen_deer.safety_plain", sfx: "none", soundscapePolicy: "silent",
      });
    }
  });
});
