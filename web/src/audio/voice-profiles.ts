import type { AgentIdV1 } from "@otter/shared";
import type { VoiceProfileV1 } from "./types";

const preferredChineseMaleVoices = [
  "Microsoft Yunjian", "Yunjian", "云健",
  "Microsoft Yunxi", "Yunxi", "云希",
  "Microsoft Yunye", "Yunye", "云野",
  "Microsoft Yunyang", "Yunyang", "云扬",
  "Microsoft Kangkang", "Kangkang", "康康",
] as const;

const preferredWarmChineseFemaleVoices = [
  "Microsoft Xiaoxiao", "Xiaoxiao", "晓晓",
  "Microsoft Yaoyao", "Yaoyao", "遥遥",
  "Microsoft Huihui", "Huihui", "慧慧",
  "Ting-Ting", "婷婷",
] as const;

const preferredCrispChineseFemaleVoices = [
  "Microsoft Xiaoyi", "Xiaoyi", "晓伊",
  "Microsoft Xiaohan", "Xiaohan", "晓涵",
  "Microsoft Huihui", "Huihui", "慧慧",
  "Microsoft Yaoyao", "Yaoyao", "遥遥",
] as const;

export const voiceProfileRegistry = {
  zen_deer: {
    "zen_deer.deep_tide": { id: "zen_deer.deep_tide", agentId: "zen_deer", locale: "zh-CN", rate: 0.82, pitch: 0.78, preferredVoiceNames: preferredChineseMaleVoices },
    "zen_deer.shore_pick": { id: "zen_deer.shore_pick", agentId: "zen_deer", locale: "zh-CN", rate: 0.88, pitch: 0.82, preferredVoiceNames: preferredChineseMaleVoices },
    "zen_deer.safety_plain": { id: "zen_deer.safety_plain", agentId: "zen_deer", locale: "zh-CN", rate: 0.9, pitch: 0.88, preferredVoiceNames: preferredChineseMaleVoices },
  },
  spirit_otter: {
    "spirit_otter.warm_companion": { id: "spirit_otter.warm_companion", agentId: "spirit_otter", locale: "zh-CN", rate: 0.92, pitch: 1.04, preferredVoiceNames: preferredWarmChineseFemaleVoices },
    "spirit_otter.caring_clear": { id: "spirit_otter.caring_clear", agentId: "spirit_otter", locale: "zh-CN", rate: 0.96, pitch: 1.02, preferredVoiceNames: preferredWarmChineseFemaleVoices },
    "spirit_otter.safety_plain": { id: "spirit_otter.safety_plain", agentId: "spirit_otter", locale: "zh-CN", rate: 0.96, pitch: 1, preferredVoiceNames: preferredWarmChineseFemaleVoices },
  },
  bird_courier: {
    "bird_courier.concierge": { id: "bird_courier.concierge", agentId: "bird_courier", locale: "zh-CN", rate: 1.03, pitch: 1.06, preferredVoiceNames: preferredCrispChineseFemaleVoices },
    "bird_courier.recommendation": { id: "bird_courier.recommendation", agentId: "bird_courier", locale: "zh-CN", rate: 1.06, pitch: 1.08, preferredVoiceNames: preferredCrispChineseFemaleVoices },
    "bird_courier.safety_plain": { id: "bird_courier.safety_plain", agentId: "bird_courier", locale: "zh-CN", rate: 0.98, pitch: 1.02, preferredVoiceNames: preferredCrispChineseFemaleVoices },
  },
} as const satisfies Record<AgentIdV1, Record<string, VoiceProfileV1>>;

const defaultVoiceProfileByAgent: Record<AgentIdV1, string> = {
  zen_deer: "zen_deer.deep_tide",
  spirit_otter: "spirit_otter.warm_companion",
  bird_courier: "bird_courier.concierge",
};

export function resolveVoiceProfile(agentId: AgentIdV1, profileId: string): VoiceProfileV1 {
  const registry = voiceProfileRegistry[agentId] as Record<string, VoiceProfileV1>;
  return registry[profileId] ?? registry[defaultVoiceProfileByAgent[agentId]]!;
}

export function validateVoiceProfileRegistry(): void {
  for (const agentId of Object.keys(voiceProfileRegistry) as AgentIdV1[]) {
    const profiles = voiceProfileRegistry[agentId] as Record<string, VoiceProfileV1>;
    if (Object.keys(profiles).length < 3 || !profiles[defaultVoiceProfileByAgent[agentId]] || !profiles[`${agentId}.safety_plain`]) throw new Error(`Agent ${agentId} 的浏览器声线配置不完整`);
  }
}
