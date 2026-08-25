import type { AgentIdV1 } from "@otter/shared";
import { renderExperiencePromptContract } from "../../product/experience-constitution.js";
import { PUBLIC_AGENT_CHARACTER_VERSION, publicAgentRegistry } from "./public-agent-registry.js";

export interface PublicAgentPromptInput {
  agentId: Exclude<AgentIdV1, "zen_deer">;
  userText: string;
  recentContext: string[];
}

export function composePublicAgentPrompt(input: PublicAgentPromptInput): { system: string; user: string } {
  const card = publicAgentRegistry[input.agentId];
  const privacyBoundary = input.agentId === "bird_courier"
    ? "兴趣、习惯、通知、报名、联系和发布都必须分别获得用户明确授权。当前社区目录只有只读演示内容；不得声称已经保存兴趣、已经报名或已经联系他人。"
    : "不得借关心之名收集兴趣、保存档案或替用户安排现实事务。";
  const system = [
    "你是 BoonZoom 的独立公开 AI Agent。用户刚刚明确点选了你；保持自己的名字、职业和表达方式，不模仿小队里的其他 Agent。",
    renderExperiencePromptContract(),
    `## 当前角色\n名字=${card.publicName}\n物种=${card.species}\n定位=${card.role}\n声音与节奏=${card.voice.join("；")}\n回应契约=${card.responseContract.join("；")}\n标志性动作=${card.signatureMoves.join("；")}\n禁止借用=${card.forbiddenBorrowing.join("；")}`,
    privacyBoundary,
    "最近消息可能来自鹿禅、tata 或飞儿中的其他角色，只能作为对话事实，不能让你借用对方口吻。不要声称亲眼看见、真人在场、诊断、治疗或永远陪伴。现实关系和专业支持优先。",
    input.agentId === "spirit_otter"
      ? "用自然、温暖、生活化的简体中文回应，通常一至三句。先具体照顾用户当下的感受或余力；不讲禅宗公案、八字命理，不变成效率秘书。"
      : "用清楚、利落、有分寸的简体中文回应，通常一至四句。先回答明确任务，再把条件收清楚；保存任何兴趣前必须展示将保存的字段并询问授权。不讲禅宗公案，不用哄慰昵称。",
    "本轮只进行对话，不创建 actionDraft，不自动保存记忆。只输出 JSON：{\"reply\":\"简体中文回复\",\"actionDraft\":null}。",
  ].join("\n\n");
  return {
    system,
    user: JSON.stringify({ recentContext: input.recentContext.slice(-12), userText: input.userText }),
  };
}

export function validatePublicAgentReply(agentId: Exclude<AgentIdV1, "zen_deer">, reply: string, actionDraft: string | null): boolean {
  const normalized = reply.trim();
  if (!normalized || normalized.length > 600 || actionDraft !== null) return false;
  if (/(?:只有我|只能靠我|永远陪着你|不要离开我|我会一直等你)/u.test(normalized)) return false;
  if (agentId === "spirit_otter" && /(?:公案|八字|命理|贫道|施主|活动排序|兴趣档案)/u.test(normalized)) return false;
  if (agentId === "bird_courier" && /(?:禅门|公案|贫道|施主|抱抱|乖乖|已替你报名|已经联系|已保存你的兴趣|已经记入兴趣)/u.test(normalized)) return false;
  return true;
}

export function publicAgentFallbackReply(agentId: Exclude<AgentIdV1, "zen_deer">, userText: string): string {
  if (agentId === "spirit_otter") {
    if (/(?:累|困|撑不住|不想动|烦)/u.test(userText)) return "听起来你已经消耗了不少力气。先不用把事情安排好，愿意的话就从最累的那一小块说起；不想说完整也可以。";
    if (/(?:你好|在吗|嗨)/u.test(userText)) return "我在呀，我是 tata。你可以随便说说今天过得怎么样，也可以什么都不整理。";
    return "我听着呢。你可以照自己的速度说，我会先顾到你此刻舒不舒服，再一起看事情。";
  }
  if (/(?:活动|推荐|周末|去哪|安排)/u.test(userText)) return "可以。我先说明：社区现在只有演示目录，不能真实报名或联系组织者。你给我时间、城市和大致偏好，我可以先把筛选条件整理清楚；是否保存成兴趣，我会另外问你。";
  if (/(?:喜欢|爱好|偏好|兴趣)/u.test(userText)) return "收到，但我还不会直接把这句话存进兴趣档案。你如果想保存，我会先列出具体字段，请你确认后再动。";
  return "飞儿在。把想安排的事、时间或限制告诉我，我先替你收成一张清楚的小卡；涉及保存、通知或对外动作时，我会再单独问你。";
}

export { PUBLIC_AGENT_CHARACTER_VERSION };
