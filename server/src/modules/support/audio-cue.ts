import type { ActiveSpirit, AgentIdV1, AudioCueV1, RiskLevel } from "@otter/shared";

export const publicAgentIds = ["zen_deer", "spirit_otter", "bird_courier"] as const satisfies readonly AgentIdV1[];

export const serverVoiceProfileRegistry = {
  zen_deer: {
    deep_tide: "zen_deer.deep_tide",
    shore_pick: "zen_deer.shore_pick",
    safety_plain: "zen_deer.safety_plain",
  },
  spirit_otter: {
    deep_tide: "spirit_otter.warm_companion",
    shore_pick: "spirit_otter.caring_clear",
    safety_plain: "spirit_otter.safety_plain",
  },
  bird_courier: {
    deep_tide: "bird_courier.concierge",
    shore_pick: "bird_courier.recommendation",
    safety_plain: "bird_courier.safety_plain",
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
  agentId?: AgentIdV1;
  riskLevel: RiskLevel;
  activeSpirit: ActiveSpirit;
  hasActionDraft: boolean;
}): AudioCueV1 {
  const agentId: AgentIdV1 = input.agentId ?? "zen_deer";
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
