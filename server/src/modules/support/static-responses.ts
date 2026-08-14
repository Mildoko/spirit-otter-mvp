import type { RiskLevel, ResponsePlan } from "@otter/shared";

export function highRiskResponse(level: RiskLevel, researchContact: string): string {
  const urgency = level === "imminent" ? "你刚才描述的情况可能有迫切危险。" : "你刚才提到的情况让我很担心你现在的安全。";
  return `${urgency}我不能替代现实中的紧急帮助。请先放下可能伤害自己或他人的物品，尽快告诉身边可信任的人，并联系${researchContact}。如果危险正在发生，请立即联系当地急救或报警服务。你现在是否处在立即可能受伤的环境中？`;
}

export function fallbackReply(plan: ResponsePlan, userText: string): { reply: string; actionDraft: string | null } {
  if (plan.activeSpirit === "shore_pick") {
    const compact = userText.trim().replace(/\s+/g, " ").slice(0, 40);
    return {
      reply: plan.transitionStyle === "blend_to_shore"
        ? `你把“${compact}”放到这里了。它一下子全挤在眼前，确实很难找到开头。我们不搬整堵墙，只先看看哪一块最有时限。`
        : `围绕“${compact}”，先不把事情排成队来吓人。我们只捞起一件现在最容易开始的小事；它可以修改，也可以放弃。`,
      actionDraft: compact ? `为“${compact.slice(0, 28)}”写下一个 10 分钟内能开始的第一步` : "写下一个 10 分钟内能开始的第一步",
    };
  }
  const compact = userText.trim().replace(/\s+/g, " ").slice(0, 40);
  return {
    reply: plan.supportMode === "stabilize"
      ? "你现在说到的分量已经很重了，这时再塞进办法，只会让人更紧。我先陪你把速度放慢一点，也想把现实里能接住你的人留在视野里；现在不需要证明你能独自扛住。"
      : `“${compact}”这句话里，像是有一部分还没来得及好好落下。我先不把它翻译成办法，也不急着让你振作。你可以沿着刚才那一点继续说；不想回答也没关系。`,
    actionDraft: null,
  };
}
