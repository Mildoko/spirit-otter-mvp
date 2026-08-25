import type { AgentIdV1 } from "@otter/shared";

export interface AgentGreetingV1 {
  text: string;
  voiceProfileId: string;
}

export const agentGreetingRegistry: Record<AgentIdV1, AgentGreetingV1> = {
  zen_deer: {
    text: "你好，我是鹿禅。水静下来，话便可以慢慢说。",
    voiceProfileId: "zen_deer.deep_tide",
  },
  spirit_otter: {
    text: "嗨，我是 tata。你可以先在这里歇一会儿。",
    voiceProfileId: "spirit_otter.warm_companion",
  },
  bird_courier: {
    text: "你好，我是飞儿。把要记的、要找的交给我就好。",
    voiceProfileId: "bird_courier.concierge",
  },
};

export function buildAgentGreetingRequest(agentId: AgentIdV1, instanceId: string) {
  const greeting = agentGreetingRegistry[agentId];
  return {
    id: `welcome-agent-${agentId}-${instanceId}`,
    text: greeting.text,
    agentId,
    profileId: greeting.voiceProfileId,
  };
}
