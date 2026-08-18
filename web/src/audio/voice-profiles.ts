import type { AgentIdV1 } from "@otter/shared";
import type { VoiceProfileV1 } from "./types";

const preferredChineseVoices = ["Xiaoxiao", "晓晓", "Ting-Ting", "婷婷", "Yaoyao", "遥遥", "Huihui", "慧慧"] as const;

export const voiceProfileRegistry = {
  spirit_otter: {
    "spirit_otter.deep_tide": { id: "spirit_otter.deep_tide", agentId: "spirit_otter", locale: "zh-CN", rate: 0.92, pitch: 0.96, preferredVoiceNames: preferredChineseVoices },
    "spirit_otter.shore_pick": { id: "spirit_otter.shore_pick", agentId: "spirit_otter", locale: "zh-CN", rate: 1, pitch: 1, preferredVoiceNames: preferredChineseVoices },
    "spirit_otter.safety_plain": { id: "spirit_otter.safety_plain", agentId: "spirit_otter", locale: "zh-CN", rate: 0.95, pitch: 1, preferredVoiceNames: preferredChineseVoices },
  },
} as const satisfies Record<AgentIdV1, Record<string, VoiceProfileV1>>;

export function resolveVoiceProfile(agentId: AgentIdV1, profileId: string): VoiceProfileV1 {
  const registry = voiceProfileRegistry[agentId] as Record<string, VoiceProfileV1>;
  return registry[profileId] ?? registry["spirit_otter.deep_tide"]!;
}

export function validateVoiceProfileRegistry(): void {
  for (const [agentId, profiles] of Object.entries(voiceProfileRegistry)) {
    if (!profiles[`${agentId}.deep_tide` as keyof typeof profiles] || !profiles[`${agentId}.shore_pick` as keyof typeof profiles] || !profiles[`${agentId}.safety_plain` as keyof typeof profiles]) {
      throw new Error(`Agent ${agentId} 的浏览器声线配置不完整`);
    }
  }
}
