import type { ActiveSpirit, AgentIdV1, AudioCueV1, RiskLevel } from "@otter/shared";

export const publicAgentIds = ["spirit_otter"] as const satisfies readonly AgentIdV1[];

export const serverVoiceProfileRegistry = {
  spirit_otter: {
    deep_tide: "spirit_otter.deep_tide",
    shore_pick: "spirit_otter.shore_pick",
    safety_plain: "spirit_otter.safety_plain",
  },
} as const satisfies Record<AgentIdV1, Record<ActiveSpirit | "safety_plain", string>>;

export function validateServerVoiceProfileRegistry(): void {
  for (const agentId of publicAgentIds) {
    const profiles = serverVoiceProfileRegistry[agentId];
    if (!profiles?.deep_tide || !profiles.shore_pick || !profiles.safety_plain) {
      throw new Error(`Agent ${agentId} 的声音配置不完整`);
    }
  }
}

export function buildAudioCue(input: {
  riskLevel: RiskLevel;
  activeSpirit: ActiveSpirit;
  hasActionDraft: boolean;
}): AudioCueV1 {
  const agentId: AgentIdV1 = "spirit_otter";
  if (input.riskLevel !== "low") {
    return {
      schemaVersion: 1,
      agentId,
      voiceProfileId: serverVoiceProfileRegistry[agentId].safety_plain,
      sfx: "none",
      soundscapePolicy: input.riskLevel === "elevated" ? "reduced" : "silent",
    };
  }

  return {
    schemaVersion: 1,
    agentId,
    voiceProfileId: serverVoiceProfileRegistry[agentId][input.activeSpirit],
    sfx: input.hasActionDraft ? "invite_chime" : "reply_ripple",
    soundscapePolicy: "normal",
  };
}
