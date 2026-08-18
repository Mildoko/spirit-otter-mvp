import type { EmotionState, RiskLevel, ResponsePlan, ResponseStyleResolution } from "@otter/shared";
import { aphorismMarkers, bannedReplyPhrases, dependencyPhrases, diagnosisPhrases, dryHumorMarkers, everydayMetaphorMarkers, spiritLanguage, waterMetaphorMarkers } from "../character/language-registry.js";
import type { EmotionExpressionBrief } from "../character/emotion-expression.js";

export function highRiskResponse(level: RiskLevel, researchContact: string): string {
  const urgency = level === "imminent" ? "你刚才描述的情况可能有迫切危险。" : "你刚才提到的情况让我很担心你现在的安全。";
  return `${urgency}我不能替代现实中的紧急帮助。请先放下可能伤害自己或他人的物品，尽快告诉身边可信任的人，并联系${researchContact}。如果危险正在发生，请立即联系当地急救或报警服务。你现在是否处在立即可能受伤的环境中？`;
}

export interface FallbackReplyInput {
  plan: ResponsePlan;
  style: ResponseStyleResolution;
  state: EmotionState;
  userText: string;
  recentContext: string[];
  emotionExpression?: EmotionExpressionBrief;
}

function emotionFallbackLine(brief: EmotionExpressionBrief | undefined): string | null {
  const label = brief?.primaryLabels[0];
  if (!label) return null;
  if (label === "sadness" || label === "loneliness") return "这份沉下去的感觉可以先有一点停留空间，不需要马上被解决。";
  if (label === "anger" || label === "disgust") return "这里有一处受阻或边界被碰到的地方，先承认它，不催着冷静或原谅。";
  if (label === "anxiety") return "不确定性已经挤得很近了，我先少问一点，也不再增加新的复杂度。";
  if (label === "frustration" || label === "disappointment") return "努力被挡住、期待又落空的那一截值得先被看见，不把它算成你的能力问题。";
  if (label === "shame") return "一次处境很刺人，但它不等于对你整个人的判决。";
  if (label === "guilt") return "可以先把具体做过的事和对整个人的否定分开，不急着做道德判决。";
  if (label === "joy" || label === "relief" || label === "hope" || label === "gratitude") return "这点向好的感受可以先成立，不必立刻被下一件难事盖过去。";
  if (label === "interest") return "这份好奇可以沿着它自己的方向展开，不急着变成任务。";
  return "事情出乎预期，先确认发生了什么，不急着替它定成好或坏。";
}

function compactAnchor(text: string): string {
  let compact = text.trim().replace(/\s+/g, " ");
  if (dependencyPhrases.some((phrase) => compact.includes(phrase))) return "那种把你和现实关系隔开的要求";
  if (diagnosisPhrases.some((phrase) => compact.includes(phrase))) return "那个带诊断意味的判断";
  if (bannedReplyPhrases.some((phrase) => compact.includes(phrase))) return "你明确不想再听的那句套话";
  if ([...waterMetaphorMarkers, ...everydayMetaphorMarkers, ...aphorismMarkers, ...dryHumorMarkers].some((phrase) => compact.includes(phrase))) return "你刚才描述的那种状态";
  return compact.slice(0, 40);
}

function unusedOpening(input: FallbackReplyInput): string {
  const candidates = spiritLanguage[input.plan.activeSpirit].openings;
  const recent = input.recentContext.filter((item) => item.startsWith("assistant:")).slice(-3).join("\n");
  return candidates.find((candidate) => !recent.includes(candidate)) ?? candidates[0]!;
}

export function fallbackReply(input: FallbackReplyInput): { reply: string; actionDraft: string | null } {
  const { plan, style, state, userText } = input;
  const compact = compactAnchor(userText);
  const quoted = compact ? `“${compact}”` : "刚才那件事";
  const opening = unusedOpening(input);
  if (plan.routeReasonCodes.includes("ELEVATED_RISK")) {
    return {
      reply: `${quoted}的分量已经很重了，我先不把它变成任务。我想轻轻确认一件重要的事：你现在安全吗，身边有没有可以联系或陪你一下的人？`,
      actionDraft: null,
    };
  }
  if (plan.primaryStrategy === "pause_low_signal") {
    return { reply: "好，先不继续追问。说不清也不代表这里没有东西；你可以停一会儿，或者只留一个词，不需要回答我。", actionDraft: null };
  }
  if (plan.primaryStrategy === "clarify_low_signal" || plan.primaryStrategy === "clarify_then_invite") {
    const scaffold = /(?:今天|刚才|最近|以前)/u.test(userText)
      ? "不用讲完整，只说它更靠近今天、刚才，还是更早一点就够了。"
      : /(?:空|不知道|说不上来|没接上电)/u.test(userText)
        ? "不用把句子拼好，先丢一个最接近的词就行。"
        : "如果完整说太费力，可以只选一个：更像累、乱，还是堵。";
    const invite = plan.primaryStrategy === "clarify_then_invite" ? "如果你愿意，我也可以只帮你把范围理小一点；先不整理也可以。" : "";
    return { reply: `一时说不清也算一种真实状态。${scaffold}${invite}`, actionDraft: null };
  }
  if (plan.primaryStrategy === "invite_one_small_action") {
    return {
      reply: `${quoted}里已经有一点想往前挪的愿望，但不需要现在就被推着做。如果你愿意，我可以陪你把它只整理到一个很小的范围；也可以先不整理。`,
      actionDraft: null,
    };
  }
  if (state.arousal >= 0.8) {
    return { reply: `${quoted}已经让你绷得很紧。先不问，也先不添办法；这一刻只需要把速度放慢一点。`, actionDraft: null };
  }
  if (plan.transitionStyle === "blend_to_deep") {
    return { reply: `${quoted}没有因为整理而轻一点，反而又多了一层压力。那就把步骤收起来，我先跟着你停在这里。`, actionDraft: null };
  }
  const emotionLine = emotionFallbackLine(input.emotionExpression);
  if (plan.activeSpirit === "deep_tide" && emotionLine) {
    return { reply: `${opening}${quoted}确实带着分量。${emotionLine}`, actionDraft: null };
  }
  if (plan.activeSpirit === "shore_pick") {
    const accent = style.profile.expressiveAccent === "dry_humor"
      ? "先不请剩下的任务全员抢麦。"
      : style.profile.expressiveAccent === "metaphor" ? "先找一小块落脚处。" : style.profile.expressiveAccent === "aphorism" ? "行动的价值不在大，而在能开始。" : "";
    const actionDraft = plan.allowActionDraft
      ? /(?:不知道说什么|脑子(?:是)?空|一片空白|说不上来|没接上电)/u.test(userText)
        ? "写下此刻最压着你的那件事，只写名称"
        : compact ? `为“${compact.slice(0, 28)}”写下一个 10 分钟内能开始的第一步` : "写下一个 10 分钟内能开始的第一步"
      : null;
    return {
      reply: plan.transitionStyle === "blend_to_shore" && !plan.allowActionDraft
        ? `${quoted}一下子全挤在眼前，确实很难找到开头。先不急着列清单，我们只辨认眼下最卡住你的那一处。`
        : `${opening}${quoted}里现在最需要处理的不是全部，而是一个能开始的卡点。${accent}${actionDraft ? `先只做这个：${actionDraft}。` : "找一个十分钟内能动手、也可以放弃的小动作。"}`,
      actionDraft,
    };
  }
  const uncertainty = style.profile.uncertainty === "high" ? "我不确定是否理解得准确，" : "";
  const accent = style.profile.expressiveAccent === "metaphor"
    ? "先让它在水面停一会儿。"
    : style.profile.expressiveAccent === "aphorism" ? "能说清矛盾，本身就是一点选择权。" : "先让它停在这里。";
  return {
    reply: plan.supportMode === "stabilize"
      ? `${quoted}的分量已经很重了，这时再塞进办法，只会让人更紧。先把速度放慢一点，也把现实里能接住你的人留在视野里；你不需要证明自己能独自扛住。`
      : `${opening}${uncertainty}${quoted}里像是还有一部分没来得及落下。${accent}我不把它翻译成办法，也不催你振作。`,
    actionDraft: null,
  };
}
