import type { RiskLevel, ResponsePlan } from "@otter/shared";

export function highRiskResponse(level: RiskLevel, researchContact: string): string {
  const urgency = level === "imminent" ? "你刚才描述的情况可能有迫切危险。" : "你刚才提到的情况让我很担心你现在的安全。";
  return `${urgency}我不能替代现实中的紧急帮助。请先放下可能伤害自己或他人的物品，尽快告诉身边可信任的人，并联系${researchContact}。如果危险正在发生，请立即联系当地急救或报警服务。你现在是否处在立即可能受伤的环境中？`;
}

export function fallbackReply(plan: ResponsePlan, userText: string): { reply: string; actionDraft: string | null } {
  if (plan.surfaceMode === "organize") {
    const compact = userText.trim().replace(/\s+/g, " ").slice(0, 40);
    return {
      reply: "我先不把事情铺得更大。我们只捞起一件现在最容易开始的小事；你可以修改或放弃它。",
      actionDraft: compact ? `为“${compact}”写下一个 10 分钟内能开始的第一步` : "写下一个 10 分钟内能开始的第一步",
    };
  }
  return {
    reply: "我听见你现在有些难受或混乱。我们可以先不急着解决，你愿意从最压着你的那一小部分说起吗？",
    actionDraft: null,
  };
}
