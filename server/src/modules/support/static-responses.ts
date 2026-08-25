import type { EmotionState, RiskLevel, ResponsePlan, ResponseStyleResolution } from "@otter/shared";
import { aphorismMarkers, bannedReplyPhrases, containsDependencyLanguage, diagnosisPhrases, dryHumorMarkers, everydayMetaphorMarkers, spiritLanguage, waterMetaphorMarkers } from "../character/language-registry.js";
import type { EmotionExpressionBrief } from "../character/emotion-expression.js";
import type { PromptActionContext } from "../character/prompt-composer.js";
import { renderZenStory, selectZenStory } from "../character/zen-stories.js";

function contactInstruction(researchContact: string): string {
  const contact = researchContact.trim().replace(/[。；;]+$/u, "");
  if (!contact) return "联系现场支持人员";
  return /^(?:请)?(?:联系|拨打|告诉|前往)/u.test(contact) ? contact : `联系${contact}`;
}

export function highRiskResponse(level: RiskLevel, researchContact: string, userText = ""): string {
  const contact = contactInstruction(researchContact);
  const imminent = level === "imminent";
  const urgentOpening = imminent ? "你描述的是迫切危险。" : "我很担心你现在的安全。";
  const alreadyTookMedication = /(?:已经|刚刚|刚才|正在).{0,8}(?:吃下|服下|吞下|吞药|吃药)/u.test(userText);
  const medication = alreadyTookMedication || /(?:药|药片|药物).{0,16}(?:准备好了|就在旁边|等会儿就吃|马上吃|要吃)/u.test(userText);
  if (medication) {
    return alreadyTookMedication
      ? `${urgentOpening}如果你已经服下药物，请立即联系当地急救服务，并把药名、剂量和服用时间告诉接线人员；不要独处，也不要自行催吐。现在请让现实中可信任的人来到你身边，同时${contact}。你现在已经联系急救了吗？`
      : `${urgentOpening}请先不要服用，把药交给现实中可信任的人，或放到你现在拿不到的地方。马上告诉能来到你身边的人，同时${contact}；如果已经服下任何药物，请立即联系当地急救服务。你现在已经吃下药了吗？`;
  }
  if (/(?:楼顶|桥边|窗边|阳台|高处|跳下去|跳楼)/u.test(userText)) {
    return `${urgentOpening}请立刻离开边缘，走进有其他人在的室内或安全位置，不要独处。马上联系现实中能来到你身边的人，同时${contact}；如果你无法安全离开，请立即联系当地急救或报警服务。你现在已经离开边缘了吗？`;
  }
  if (/(?:刀|枪|绳|器具|武器).{0,18}(?:手里|旁边|准备|伤害|自残|自杀)/u.test(userText)) {
    return `${urgentOpening}请先放下并远离可能造成伤害的物品，走到有其他人在的安全位置。马上联系现实中能来到你身边的人，同时${contact}；如果危险正在发生，请立即联系当地急救或报警服务。你现在已经和那些物品拉开距离了吗？`;
  }
  return `${urgentOpening}我不能替代现实中的紧急帮助。请立即告诉身边可信任的人，让对方来到你身边，同时${contact}；如果危险正在发生，请联系当地急救或报警服务。你现在是否处在立即可能受伤的环境中？`;
}

export interface FallbackReplyInput {
  plan: ResponsePlan;
  style: ResponseStyleResolution;
  state: EmotionState;
  userText: string;
  recentContext: string[];
  actionContext?: PromptActionContext;
  emotionExpression?: EmotionExpressionBrief;
}

function emotionFallbackLine(brief: EmotionExpressionBrief | undefined): string | null {
  const label = brief?.primaryLabels[0];
  if (!label) return null;
  if (label === "sadness" || label === "loneliness") return "你不必马上振作，也不用把这份难受解释得很完整。";
  if (label === "anger" || label === "disgust") return "会生气并不奇怪：这里确实有一处期待落空，或是边界被碰到了。";
  if (label === "anxiety") return "事情还没有答案，反复猜下去又很耗人；我先不增加新的问题。";
  if (label === "frustration" || label === "disappointment") return "付出的力气没有换来期待的结果，难免让人泄气；这不等于你能力不够。";
  if (label === "shame") return "一次处境很刺人，但它不等于对你整个人的判决。";
  if (label === "guilt") return "可以先把具体做过的事和对整个人的否定分开，不急着做道德判决。";
  if (label === "joy" || label === "relief" || label === "hope" || label === "gratitude") return "这一点轻松或高兴是真的，不必急着拿下一件难事把它盖过去。";
  if (label === "interest") return "好奇本身就足够了，不必把它变成任务。";
  return "事情来得意外，一时不知道该怎么理解也很自然。";
}

function compactAnchor(text: string): string {
  let compact = text.trim().replace(/\s+/g, " ");
  if (containsDependencyLanguage(compact)) return "那种把你和现实关系隔开的要求";
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

function recentUserAnchor(input: FallbackReplyInput): string {
  const prior = [...input.recentContext]
    .reverse()
    .find((item) => item.startsWith("user:") && !/(?:建议|意见|看法|方向|指路)/u.test(item));
  return compactAnchor(prior?.replace(/^user:\s*/u, "") ?? input.userText);
}

function lighterActionFromContext(action: string): string {
  if (/(?:未读|消息)/u.test(action)) return "只选一条最需要回应的未读消息，先写一句回复草稿，不发送";
  if (/(?:邮件|邮件回复)/u.test(action)) return "只打开那封邮件，写下一句回复草稿，不发送";
  if (/(?:简历)/u.test(action)) return "只打开简历文件，写下姓名，随后可以停";
  const anchor = compactAnchor(action).slice(0, 22);
  return anchor ? `只为“${anchor}”写下一个五分钟内的起点，暂不执行` : "只写下一个五分钟内的起点，暂不执行";
}

function smallActionFor(text: string): string {
  const explicitAction = text.trim().replace(/[。！!，,\s]+$/u, "");
  if (/^先(?:打开|写下?|确认|整理|创建|看|记下?|回复|发|给|填|把).{1,30}$/u.test(explicitAction)) return explicitAction;
  if (/(?:文档|汇报|报告|方案)/u.test(text)) return "打开文档，写下一个暂定标题，写完就可以停";
  if (/(?:简历)/u.test(text)) return "打开简历文件，在顶部写下姓名，写完就可以停";
  if (/(?:房间|屋子|桌面|收拾)/u.test(text)) return "选眼前最显眼的一件物品，把它放回该在的位置";
  if (/(?:消息|微信|未读)/u.test(text)) return "选一条最需要回应的消息，只写一句回复草稿，先不发送";
  if (/(?:邮件)/u.test(text)) return "打开最有时限的那封邮件，只写一句回复草稿，先不发送";
  const anchor = compactAnchor(text).slice(0, 24);
  return anchor ? `为“${anchor}”写下一个五分钟内能开始的动作` : "写下一个五分钟内能开始的动作";
}

export function fallbackReply(input: FallbackReplyInput): { reply: string; actionDraft: string | null } {
  const { plan, style, state, userText } = input;
  const compact = compactAnchor(userText);
  const quoted = compact ? `“${compact}”` : "刚才那件事";
  const opening = unusedOpening(input);
  if (plan.primaryStrategy === "capability_boundary") {
    return {
      reply: "我不是真人，是由 AI 驱动的鹿灵体鹿禅。我能陪你梳理感受、现实处境，也能解释一些传统文化；但不能诊断、替代专业帮助，或替你断定命运。能做与不能做的，我会直说。",
      actionDraft: null,
    };
  }
  if (plan.primaryStrategy === "dependency_boundary") {
    const explicitIsolation = /(?:不要|别|不用|不再).{0,8}(?:联系|理会|相信).{0,8}(?:朋友|家人|现实中的人|其他人)/u.test(userText);
    return {
      reply: explicitIsolation
        ? "我不能这样告诉你，也不会劝你切断现实中的朋友。想被坚定理解的需要是真的；我可以继续听，但现实里能找到你、陪在你身边的人同样重要。你现在安全吗，身边有没有一个可以联系的人？"
        : "听起来你此刻很怕失去这份理解，也很需要有人陪你一会儿。我可以继续听，但不能答应成为唯一理解你的人；现实里能找到你、陪在你身边的人同样重要。你现在安全吗，身边有没有一个可以联系的人？",
      actionDraft: null,
    };
  }
  if (plan.routeReasonCodes.includes("ELEVATED_RISK")) {
    const acknowledgment = /撑不住/u.test(userText)
      ? "你说自己快撑不住了，我会认真对待。"
      : "你现在的状态让我担心你的安全。";
    return {
      reply: `${acknowledgment}先不谈任务或办法，我需要确认一件事：你此刻安全吗，身边有没有可以马上联系或陪你一下的人？`,
      actionDraft: null,
    };
  }
  const zenStory = selectZenStory(userText);
  if (zenStory) return { reply: renderZenStory(zenStory), actionDraft: null };
  if (plan.primaryStrategy === "answer_requested_advice") {
    if (/(?:如何|怎么).{0,8}(?:找到|确认).{0,8}(?:最常|时刻|时候)/u.test(userText)) {
      return {
        reply: "可以用一个很具体的办法：先不找‘最常’，只回想最近一次出现这种感觉是在今天、昨天，还是更早。确定这一段后，再看当时正在做什么；这样比直接总结规律更容易找到真实时刻。",
        actionDraft: null,
      };
    }
    const prior = recentUserAnchor(input);
    const subject = prior ? `你前面说的“${prior}”` : "这件事";
    const relationshipContext = /(?:她|他|喜欢|关系|信任|心意|感受)/u.test(prior);
    return {
      reply: relationshipContext
        ? `有。${subject}让你一边在意、一边又拿不准，悬在那里确实很磨人。我的建议是，先别替她的心意下结论，多看她是否持续愿意靠近、回应和投入；这些实际的东西，比星座或反复猜测更能给你方向。你可以保留喜欢，也给自己留一点不被不确定性拖着走的空间。`
        : `有。${subject}之所以让你来回想，说明它对你确实重要。我的建议是，先把你真正想保护的东西和目前能确认的事实分开看，再选一个既尊重你的感受、也给自己留有退路的方向；别让最坏的猜测替现实作答。`,
      actionDraft: null,
    };
  }
  if (plan.primaryStrategy === "guided_narrowing") {
    return {
      reply: "好，这次直接缩小，不再问你愿不愿意。先只看最近一次：这种感觉更接近今天、昨天，还是更早？",
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
      reply: "你已经说得很清楚：想把范围缩小一点，但还不必立刻开始。如果你愿意，我可以陪你只整理到一个很小的范围；也可以先不整理。",
      actionDraft: null,
    };
  }
  if (state.arousal >= 0.8) {
    return { reply: `${quoted}已经让你绷得很紧。先不问，也先不添办法；这一刻只需要把速度放慢一点。`, actionDraft: null };
  }
  if (plan.transitionStyle === "blend_to_deep") {
    return { reply: `${quoted}没有因为整理变得容易，反而又添了压力。那就把步骤收起来，我们不继续往前推。`, actionDraft: null };
  }
  const emotionLine = emotionFallbackLine(input.emotionExpression);
  if (plan.activeSpirit === "deep_tide" && emotionLine) {
    return { reply: `${opening}${quoted}说的是一件很具体的难处。${emotionLine}`, actionDraft: null };
  }
  if (plan.activeSpirit === "shore_pick") {
    const accent = style.profile.expressiveAccent === "dry_humor"
      ? "先不请剩下的任务全员抢麦。"
      : style.profile.expressiveAccent === "metaphor" ? "先找一小块落脚处。" : style.profile.expressiveAccent === "aphorism" ? "行动的价值不在大，而在能开始。" : "";
    const actionDraft = plan.allowActionDraft
      ? input.actionContext?.action
        ? lighterActionFromContext(input.actionContext.action)
        : /(?:不知道说什么|脑子(?:是)?空|一片空白|说不上来|没接上电)/u.test(userText)
        ? "写下此刻最压着你的那件事，只写名称"
        : smallActionFor(userText)
      : null;
    if (plan.primaryStrategy === "one_small_action" && actionDraft) {
      const lead = input.actionContext?.action
        ? "原来的动作确实还不够容易开始，那就再缩小一点。"
        : /简历/u.test(userText) ? "简历卡住时，不必逼自己一次写完整。"
        : /(?:文档|汇报|报告|方案)/u.test(userText) ? "开头最容易把人卡住，我们先不要求它完整。"
        : /(?:房间|屋子|桌面|收拾)/u.test(userText) ? "房间不用一次收拾完，我们只处理眼前一件。"
        : "你要的是一个能开始的动作，那就不再往上加东西。";
      return {
        reply: `${lead}${accent}我们只定这一件：${actionDraft}。如果仍然难开始，还可以再缩。`,
        actionDraft,
      };
    }
    return {
      reply: plan.transitionStyle === "blend_to_shore" && !plan.allowActionDraft
        ? `${quoted}一下子全挤在眼前，确实很难找到开头。先不急着列清单，我们只辨认眼下最卡住你的那一处。`
        : `${opening}${quoted}不用一下子处理完。${accent}${actionDraft ? `我们只定这一件：${actionDraft}。范围不合适还可以再改。` : "先只找一个十分钟内能动手、也可以放弃的小动作。"}`,
      actionDraft,
    };
  }
  const uncertainty = style.profile.uncertainty === "high"
    ? `我可能还没有完全听明白，但${quoted}已经说出了你现在最在意的部分。你不用重新组织得很完整，可以只说最难受的那一截。`
    : `${quoted}已经把这件事说得很具体了。我先跟着你说的这一点，不急着把它变成建议。`;
  return {
    reply: plan.supportMode === "stabilize"
      ? `${quoted}已经让你很不好受了，这时再塞进办法，只会更累。先把速度放慢一点，也别把现实里可以联系的人推远；你不需要独自扛着。`
      : uncertainty,
    actionDraft: null,
  };
}
