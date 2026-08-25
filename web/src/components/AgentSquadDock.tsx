import type { AgentIdV1 } from "@otter/shared";
import deerAvatar from "../assets/spirit-deer-zen-v1.png";
import otterAvatar from "../assets/spirit-otter.png";

export const agentUiRegistry: Record<AgentIdV1, {
  name: string;
  species: string;
  shortRole: string;
  emptyTitle: string;
  emptyBody: string;
}> = {
  zen_deer: {
    name: "鹿禅",
    species: "鹿灵",
    shortRole: "禅意观照",
    emptyTitle: "鹿禅在听",
    emptyBody: "可以说说眼前的事，也可以请鹿禅讲一则禅门故事。",
  },
  spirit_otter: {
    name: "tata",
    species: "水獭",
    shortRole: "温馨陪伴",
    emptyTitle: "tata 靠过来了",
    emptyBody: "不用先整理好。今天累不累、过得怎么样，都可以慢慢说。",
  },
  bird_courier: {
    name: "飞儿",
    species: "飞鸟信差",
    shortRole: "生活秘书",
    emptyTitle: "飞儿已接入",
    emptyBody: "把想安排的事、时间或偏好交给她；涉及保存和对外动作时，她会先问你。",
  },
};

const agentIds = ["zen_deer", "spirit_otter", "bird_courier"] as const satisfies readonly AgentIdV1[];

export function AgentSquadDock({
  activeAgentId,
  disabled,
  onActivate,
}: {
  activeAgentId: AgentIdV1;
  disabled?: boolean;
  onActivate: (agentId: AgentIdV1) => void;
}) {
  return <nav className="agent-squad-dock" aria-label="Agent 小队">
    <span className="agent-squad-label">我的小队</span>
    <div>
      {agentIds.map((agentId) => {
        const agent = agentUiRegistry[agentId];
        const active = activeAgentId === agentId;
        return <button
          type="button"
          key={agentId}
          className={`agent-squad-member agent-${agentId}${active ? " agent-active" : ""}`}
          aria-pressed={active}
          aria-label={`${active ? "当前 Agent" : "与"}${agent.name}对话，${agent.shortRole}`}
          disabled={disabled}
          onClick={() => onActivate(agentId)}
        >
          <span className="agent-squad-avatar" aria-hidden="true">
            {agentId === "zen_deer" && <img src={deerAvatar} alt="" />}
            {agentId === "spirit_otter" && <img src={otterAvatar} alt="" />}
            {agentId === "bird_courier" && <i className="feier-bird-mark"><b /><b /><b /></i>}
          </span>
          <span className="agent-squad-copy"><strong>{agent.name}</strong><small>{agent.shortRole}</small></span>
          <span className="agent-presence" aria-hidden="true" />
        </button>;
      })}
    </div>
  </nav>;
}
