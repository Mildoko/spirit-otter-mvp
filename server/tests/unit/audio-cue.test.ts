import { describe, expect, it } from "vitest";
import { buildAudioCue, publicAgentIds, serverVoiceProfileRegistry, validateServerVoiceProfileRegistry } from "../../src/modules/support/audio-cue.js";

describe("audio cue", () => {
  it("keeps every public agent registered", () => {
    expect(() => validateServerVoiceProfileRegistry()).not.toThrow();
    expect(Object.keys(serverVoiceProfileRegistry)).toEqual(publicAgentIds);
  });

  it.each([
    ["deep_tide", "spirit_otter.deep_tide"],
    ["shore_pick", "spirit_otter.shore_pick"],
  ] as const)("maps %s to its voice profile", (activeSpirit, voiceProfileId) => {
    expect(buildAudioCue({ riskLevel: "low", activeSpirit, hasActionDraft: false })).toEqual({
      schemaVersion: 1,
      agentId: "spirit_otter",
      voiceProfileId,
      sfx: "reply_ripple",
      soundscapePolicy: "normal",
    });
  });

  it("uses the invitation sound for action drafts", () => {
    expect(buildAudioCue({ riskLevel: "low", activeSpirit: "shore_pick", hasActionDraft: true }).sfx).toBe("invite_chime");
  });

  it("reduces elevated risk and silences high/imminent decoration", () => {
    expect(buildAudioCue({ riskLevel: "elevated", activeSpirit: "deep_tide", hasActionDraft: true })).toMatchObject({
      voiceProfileId: "spirit_otter.safety_plain", sfx: "none", soundscapePolicy: "reduced",
    });
    for (const riskLevel of ["high", "imminent"] as const) {
      expect(buildAudioCue({ riskLevel, activeSpirit: "shore_pick", hasActionDraft: true })).toMatchObject({
        voiceProfileId: "spirit_otter.safety_plain", sfx: "none", soundscapePolicy: "silent",
      });
    }
  });
});
