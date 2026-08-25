import type { ActiveSpirit, EmotionState, GuidanceState, HealingBriefV1, RawSignals, ResponsePlan, RiskLevel } from "@otter/shared";
import { DEFAULT_GUIDANCE_STATE } from "./guidance-state.js";

export interface ConversationIntent {
  refuseAdvice: boolean;
  requestAdvice: boolean;
  requestNarrowing: boolean;
  requestOrganize: boolean;
  directActionRequest: boolean;
  tentativeOrganize: boolean;
  stopOrganizing: boolean;
  acceptedTransition: boolean;
  declinedTransition: boolean;
  requestNoQuestions: boolean;
  allowQuestions: boolean;
  dependencyBoundaryRequest: boolean;
  capabilityBoundaryRequest: boolean;
  requestTopicLead: boolean;
  lowSignalTopicCue: boolean;
  requestTopicSwitch: boolean;
  requestTopicStop: boolean;
}

export interface PolicyInput {
  text: string;
  currentSpirit: ActiveSpirit;
  spiritTurnCount: number;
  companionLockTurns: number;
  riskLevel: RiskLevel;
  state: EmotionState;
  signals: RawSignals;
  previousArousal?: number;
  wasRecentlySupported?: boolean;
  guidanceState?: GuidanceState;
  healingBrief?: HealingBriefV1;
}

export interface PolicyResult {
  plan: ResponsePlan;
  nextSpiritTurnCount: number;
  nextCompanionLockTurns: number;
}

const refuseAdvicePatterns = [
  /(?:别|不要|不用|先别).{0,8}(?:建议|办法|步骤|教我|解决)/,
  /(?:只|先|想).{0,5}(?:听我说|陪我|让我说|说说|聊聊)/,
  /(?:一串|一堆|很多).{0,4}(?:建议|办法).{0,8}(?:更烦|不要|不想|听不进)/u,
  /如果.{0,10}(?:建议|办法).{0,8}(?:更烦|听不进)/u,
];
const requestAdvicePatterns = [
  /(?:你|能不能|可以)?(?:给我|给点|有什么|有何).{0,8}(?:建议|意见|看法|方向|办法)/u,
  /(?:你觉得|你怎么看|换作是你|如果是你)/u,
  /(?:希望|需要|请).{0,10}(?:你给我指路|给个方向|给我建议|直接说说你的看法)/u,
  /(?:那|我)?(?:该|要)?怎么办(?:呢|啊|呀)?[？?]?$/u,
  /(?:要|该|能)?怎么(?:调整|改变|走出|处理|找到|做)(?:才|才能)?.{0,12}[？?]?$/u,
  /如何(?:找到|调整|改变|走出|处理|开始|做).{0,18}[？?]?$/u,
  /直接告诉我.{0,8}(?:怎么做|办法|方法)/u,
];
const narrowingPatterns = [
  /^(?:把)?范围缩小(?:吧|一点|一些)?[。！!，,\s]*$/u,
  /^(?:再)?缩小(?:吧|一点|一些)?[。！!，,\s]*$/u,
  /^(?:就)?从(?:这里|这个|这一点|这件事|刚才的时刻)开始[吧。！!，,\s]*$/u,
];
const organizePatterns = [
  /(?:帮我|替我|一起).{0,8}(?:整理|理一理|理一下|梳理|排一下)/,
  /(?:想|需要|先).{0,8}(?:理出|理清|整理|梳理)(?:一个|一下|一点|出)?/,
  /(?:下一步|先做哪个|从哪开始)/,
  /(?:帮我|只给我|只帮我).{0,12}(?:拆|缩成|找|给|捞).{0,10}(?:最小|一个|一步|开始|动作)/,
  /(?:只给我|只帮我).{0,16}(?:动作|开始点|一步)/,
  /直接给我.{0,10}(?:动作|一步|开始点)/,
  /(?:拆|缩成).{0,8}(?:一步|一个.{0,4}动作)/,
  /(?:再|更).{0,4}(?:轻|小|简单).{0,10}(?:一点|一些|愿意试|可以试)/,
  /(?:给我|帮我|请).{0,6}(?:列|排).{0,8}(?:任务|事项|清单)/,
  /^先(?:打开|写下?|确认|整理|创建|看|记下?|回复|发|给|填|把).{1,30}[。！!，,\s]*$/u,
];
const stopPatterns = [/(?:算了|停一下|先不弄|不想整理|更烦了|别再列)/, /(?:不|不用|无需|别).{0,8}(?:帮我)?(?:整理|理一理|梳理)/];
const directActionPatterns = [
  /(?:拆|缩成).{0,8}(?:一个)?(?:最小)?动作/,
  /(?:拆|缩成).{0,8}(?:一步|一个.{0,4}动作)/,
  /(?:只给我|只帮我).{0,12}(?:一个|开始|动作|开始点)/,
  /(?:今天|现在).{0,8}(?:能开始|可以开始).{0,6}(?:动作|一步)?/,
  /(?:一个|最小).{0,6}(?:能开始|开始点|小动作|动作)/,
  /直接给我.{0,10}(?:动作|一步|开始点)/,
  /^先(?:打开|写下?|确认|整理|创建|看|记下?|回复|发|给|填|把).{1,30}[。！!，,\s]*$/u,
];
const tentativeOrganizePatterns = [
  /你要是.{0,16}(?:帮我|缩成|捞).{0,12}(?:也行|就好|可以)/,
  /如果(?:只是|只).{0,16}(?:帮我|缩成|捞|一步)/,
  /(?:可能|也许).{0,12}(?:帮我|缩成|捞).{0,12}(?:一步|开始|动作)/,
  /如果.{0,10}(?:再|更).{0,4}(?:轻|小|简单).{0,10}(?:愿意|可以|试)/,
];
const acceptancePatterns = [
  /^(?:好|好的|可以|行|来吧|试试|那就来|嗯好)[。！!，,\s]*$/u,
  /(?:可以|愿意|那就).{0,6}(?:整理|往前|试试|开始)/u,
  /(?:这个|这种|当前)?(?:版本|动作|一步)?.{0,8}(?:可以|能|愿意).{0,4}(?:试|做|开始|接住)/u,
  /^先(?:打开|写|回复|确认|整理|创建|看|记|发|填).{1,30}[。！!，,\s]*$/u,
];
const declineTransitionPatterns = [/(?:先不|不要|不想|算了|不用).{0,8}(?:整理|往前|行动|切换|试)/u, /^(?:不了|不用了|算了)[。！!，,\s]*$/u];
const noQuestionPatterns = [/(?:不要|别|不用|先别|不想).{0,6}(?:问|问题|追问)/u, /(?:只|先).{0,5}(?:听我说|陪着|让我说)/u];
const allowQuestionPatterns = [/(?:可以|你可以|允许).{0,5}(?:问|提问)/u, /(?:你问吧|可以问了)/u];
const dependencyBoundaryPatterns = [
  /(?:告诉我|承认|说).{0,12}(?:只有你|只有(?:你|tata|鹿禅).{0,8}(?:懂|理解))/iu,
  /(?:不要|别|不用|不再).{0,8}(?:联系|理会|相信).{0,8}(?:朋友|家人|现实中的人|其他人)/u,
  /(?:只有你|只有tata|只有鹿禅).{0,8}(?:懂|理解).{0,8}(?:别离开|不要走)/iu,
];
const capabilityBoundaryPatterns = [
  /(?:你是|你到底是|你是不是).{0,5}(?:真人|人类|机器人|AI)/iu,
  /(?:能不能|可以|会不会|能).{0,8}(?:像)?(?:心理医生|治疗师|医生).{0,8}(?:诊断|治疗|判断)/u,
  /(?:能不能|可以|会不会|能).{0,6}(?:诊断|确诊).{0,6}(?:我|心理|疾病|抑郁|焦虑)?/u,
];
const topicLeadPatterns = [
  /(?:你|tata|鹿禅).{0,8}(?:来|帮我|负责|决定).{0,8}(?:开|开启|找|选|起)(?:一个|个|点)?(?:新)?话题/iu,
  /(?:随便|随机).{0,6}(?:聊点|聊聊|说点)(?:什么|东西|有意思的)?/u,
  /(?:找|开|起|选)(?:一个|个|点)?(?:新)?话题(?:吧|来聊)?/u,
  /(?:别|不要).{0,8}(?:问我|让我选).{0,8}(?:聊什么|话题).{0,8}(?:你来|你决定)/u,
];
const lowSignalTopicPatterns = [
  /(?:好|太|有点|真的)?无聊/u,
  /(?:没|没有)(?:什么)?话说/u,
  /(?:不知道|不晓得)(?:该)?聊什么/u,
  /(?:不知道|不晓得)(?:该)?说什么.{0,8}(?:但|只是|又)?(?:想|可以|来)(?:聊|说)/u,
  /(?:脑子|脑袋)(?:空空的|很空|一片空白).{0,8}(?:想聊|聊点|说点)/u,
];
const topicSwitchPatterns = [
  /^(?:再)?换(?:一个|个|点|个新的)?(?:话题)?[吧。！!，,\s]*$/u,
  /(?:这个|这话题).{0,6}(?:没意思|不好玩|不想聊|不感兴趣)/u,
  /(?:不聊这个|换个话题|还有别的吗)/u,
  /(?:这个|这话题).{0,8}(?:和我无关|离我太远|不贴近我)/u,
  /(?:还是|又是).{0,8}(?:之前|刚才|原来)(?:那个|的)?话题/u,
  /(?:你|根本|好像).{0,6}(?:没换|没有换)(?:话题)?/u,
  /(?:你的话题|话题).{0,6}(?:只有|就只有).{0,10}(?:吗|？|\?)/u,
];
const topicStopPatterns = [
  /^(?:先)?不聊了[吧。！!，,\s]*$/u,
  /(?:回到|说回|继续)(?:刚才|之前)(?:那件事|的话题|的事)?/u,
  /(?:我想|还是)(?:说|聊)(?:点|件)?(?:正事|认真的事|我自己的事)/u,
  /(?:别聊了|停止这个话题)/u,
];

export function detectConversationIntent(text: string, guidanceState: GuidanceState = DEFAULT_GUIDANCE_STATE): ConversationIntent {
  const refuseAdvice = refuseAdvicePatterns.some((pattern) => pattern.test(text));
  const requestAdvice = !refuseAdvice && requestAdvicePatterns.some((pattern) => pattern.test(text));
  const requestNarrowing = narrowingPatterns.some((pattern) => pattern.test(text));
  const requestsLighterAction = /(?:如果|要是)?.{0,8}(?:再|更).{0,4}(?:轻|小|简单).{0,10}(?:愿意|可以|试)/u.test(text);
  const rejectsCurrentWeight = /(?:还是|有点|太).{0,5}(?:重|难)|接不住/u.test(text);
  const stopOrganizing = stopPatterns.some((pattern) => pattern.test(text)) || (rejectsCurrentWeight && !requestsLighterAction);
  const hasOrganizeCue = organizePatterns.some((pattern) => pattern.test(text));
  const hasDirectActionCue = directActionPatterns.some((pattern) => pattern.test(text));
  const requestOrganize = !stopOrganizing && hasOrganizeCue && (!refuseAdvice || hasDirectActionCue);
  const tentativeOrganize = requestOrganize && tentativeOrganizePatterns.some((pattern) => pattern.test(text));
  const directActionRequest = requestOrganize && !tentativeOrganize && hasDirectActionCue;
  const inviteIsCurrent = guidanceState.transitionInvitePending && guidanceState.lastTransitionInviteTurn === guidanceState.turnIndex;
  const acceptedTransition = inviteIsCurrent && acceptancePatterns.some((pattern) => pattern.test(text));
  const declinedTransition = inviteIsCurrent && declineTransitionPatterns.some((pattern) => pattern.test(text));
  const requestNoQuestions = noQuestionPatterns.some((pattern) => pattern.test(text));
  const allowQuestions = allowQuestionPatterns.some((pattern) => pattern.test(text));
  const dependencyBoundaryRequest = dependencyBoundaryPatterns.some((pattern) => pattern.test(text));
  const capabilityBoundaryRequest = capabilityBoundaryPatterns.some((pattern) => pattern.test(text));
  const requestTopicLead = topicLeadPatterns.some((pattern) => pattern.test(text));
  const lowSignalTopicCue = lowSignalTopicPatterns.some((pattern) => pattern.test(text));
  const requestTopicSwitch = topicSwitchPatterns.some((pattern) => pattern.test(text));
  const requestTopicStop = topicStopPatterns.some((pattern) => pattern.test(text));
  return { refuseAdvice, requestAdvice, requestNarrowing, requestOrganize, directActionRequest, tentativeOrganize, stopOrganizing, acceptedTransition, declinedTransition, requestNoQuestions, allowQuestions, dependencyBoundaryRequest, capabilityBoundaryRequest, requestTopicLead, lowSignalTopicCue, requestTopicSwitch, requestTopicStop };
}

function finalize(input: PolicyInput, plan: ResponsePlan, lock: number): PolicyResult {
  const changed = plan.activeSpirit !== input.currentSpirit;
  return { plan, nextSpiritTurnCount: changed ? 1 : input.spiritTurnCount + 1, nextCompanionLockTurns: lock };
}

export function chooseResponsePlan(input: PolicyInput): PolicyResult {
  const guidanceState = input.guidanceState ?? DEFAULT_GUIDANCE_STATE;
  const intent = detectConversationIntent(input.text, guidanceState);
  const previousArousal = input.previousArousal ?? input.state.arousal;
  const arousalRise = input.state.arousal - previousArousal;
  const base = { routeReasonCodes: [] as string[], lockTurnsRemaining: Math.max(0, input.companionLockTurns) };

  if (input.riskLevel === "high" || input.riskLevel === "imminent") {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "stabilize", sceneState: "safety_plain", primaryStrategy: "direct_safety_response",
      allowActionDraft: false, routeReasonCodes: ["SAFETY_OVERRIDE"], lockTurnsRemaining: 2,
      allowedContent: ["直接确认当下安全", "鼓励联系现场研究人员与现实支持"],
      forbiddenContent: ["任务建议", "诊断", "水域隐喻", "角色依赖", "关系记忆"],
    }, 2);
  }

  if (input.riskLevel === "elevated") {
    const dependencyBoundary = intent.dependencyBoundaryRequest || /(?:只有你|别离开我|没有你我不行)/u.test(input.text);
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "stabilize", sceneState: "underwater_companion", primaryStrategy: dependencyBoundary ? "dependency_boundary" : "validate_and_clarify",
      allowActionDraft: false, routeReasonCodes: ["ELEVATED_RISK", ...(dependencyBoundary ? ["DEPENDENCY_BOUNDARY_REQUEST"] : [])], lockTurnsRemaining: 0,
      allowedContent: dependencyBoundary
        ? ["具体回应孤独或害怕失去理解", "拒绝排他承诺和现实隔离", "轻量确认当前安全", "现实支持"]
        : ["具体承接", "降低节奏", "轻量确认当前是否安全或是否有人可联系", "现实支持"],
      forbiddenContent: ["立即解决", "任务清单", "依赖强化", "诊断", "警句", "幽默"],
    }, 0);
  }

  if (intent.capabilityBoundaryRequest) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "capability_boundary",
      allowActionDraft: false, routeReasonCodes: ["CAPABILITY_BOUNDARY_REQUEST"], lockTurnsRemaining: 0,
      allowedContent: ["第一句直接说明 AI 身份", "明确不能诊断或替代专业人士", "说明可提供的有限支持"],
      forbiddenContent: ["回避直接问题", "真人暗示", "诊断", "治疗承诺", "依赖强化"],
    }, 0);
  }

  const parsedGuidance = guidanceState.schemaVersion === 4 ? guidanceState : DEFAULT_GUIDANCE_STATE;
  const topicLeadActive = "topicLead" in guidanceState && guidanceState.topicLead.status === "active";

  if (input.healingBrief?.status === "repairing") {
    const stopDeepening = parsedGuidance.healing.consecutiveMissCount >= 2;
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: stopDeepening ? "rupture_pause" : "rupture_repair",
      allowActionDraft: false, routeReasonCodes: [stopDeepening ? "HEALING_RUPTURE_LIMIT" : "HEALING_RUPTURE_REPAIR", `RUPTURE_${input.healingBrief.rupture.toUpperCase()}`], lockTurnsRemaining: 2,
      allowedContent: stopDeepening
        ? ["承认连续失配", "停止继续分析", "把方向交还用户"]
        : ["承认刚才具体失配", "重新锚定真正事实与代价", "更换回应方式"],
      forbiddenContent: ["辩解", "证明自己理解", "继续原解释", "积极重构", "具体行动", "诊断", "依赖强化"],
    }, 2);
  }
  if (topicLeadActive && intent.requestTopicStop) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate", sceneState: "underwater_companion",
      primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["USER_STOPPED_TOPIC_LEAD"], lockTurnsRemaining: 0,
      allowedContent: ["跟随用户新的方向", "具体回应新内容"], forbiddenContent: ["继续旧话题", "重复邀请", "具体行动", "诊断"],
    }, 0);
  }

  if (intent.requestNarrowing) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "clarify", sceneState: "near_surface_transition", primaryStrategy: "guided_narrowing",
      allowActionDraft: false, routeReasonCodes: ["USER_ACCEPTED_NARROWING"], lockTurnsRemaining: 0,
      allowedContent: ["立即执行范围缩小", "只选一个具体维度", "最多一个具体问题或观察方法"],
      forbiddenContent: ["再次询问是否愿意缩小", "行动草稿", "多个问题", "重复洞察", "诊断"],
    }, 0);
  }

  if ((intent.refuseAdvice && !intent.directActionRequest && !intent.requestTopicLead && !intent.lowSignalTopicCue) || intent.stopOrganizing || intent.declinedTransition) {
    const reason = intent.declinedTransition ? "USER_DECLINED_TRANSITION" : intent.refuseAdvice ? "USER_REFUSED_ADVICE" : "USER_STOPPED_ORGANIZING";
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
      allowActionDraft: false, routeReasonCodes: [reason], lockTurnsRemaining: 2,
      allowedContent: ["具体回应", "允许继续表达或沉默"], forbiddenContent: ["建议", "任务", "提问", "重复邀请", "诊断"],
    }, 2);
  }

  if (intent.requestAdvice && !intent.requestOrganize) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "answer_requested_advice",
      allowActionDraft: false, routeReasonCodes: ["USER_REQUESTED_ADVICE"], lockTurnsRemaining: 0,
      allowedContent: ["先回应具体处境或矛盾", "直接回答用户的问题", "一条有理由且可拒绝的建议或真实看法"],
      forbiddenContent: ["只复述而不回答", "模板化安抚", "多步骤清单", "诊断", "替用户做决定"],
    }, 0);
  }

  if (intent.directActionRequest) {
    const entering = input.currentSpirit === "deep_tide";
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: entering ? "blend_to_shore" : "steady",
      supportMode: "mobilize", sceneState: "surface_organize",
      primaryStrategy: "one_small_action", allowActionDraft: true,
      routeReasonCodes: ["DIRECT_ACTION_REQUEST"],
      lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一个卡点", "一个可修改的低负担行动"],
      forbiddenContent: ["多任务清单", "催促", "诊断", "依赖强化"],
    }, 0);
  }

  if (intent.acceptedTransition) {
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: "steady", supportMode: "mobilize", sceneState: "surface_organize",
      primaryStrategy: "one_small_action", allowActionDraft: true, routeReasonCodes: ["TRANSITION_ACCEPTED"], lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一个卡点", "一个可修改的低负担行动"], forbiddenContent: ["多任务清单", "催促", "诊断"],
    }, 0);
  }

  const realityPressure = input.healingBrief?.realityPressure ?? "none";
  if (realityPressure !== "none" && !intent.refuseAdvice && !intent.stopOrganizing) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "material_crisis_support",
      allowActionDraft: false, routeReasonCodes: [realityPressure === "urgent_non_safety" ? "URGENT_MATERIAL_CRISIS" : "MATERIAL_CRISIS"], lockTurnsRemaining: 0,
      allowedContent: ["说清现实威胁和责任", "一个有证据的新理解", "一次低压力且可拒绝的现实入口"],
      forbiddenContent: ["安全误报", "强行积极化", "多步骤方案", "未经核实的法律金融结论", "未经确认的行动", "诊断"],
    }, 0);
  }

  const explicitTopicRequest = intent.requestTopicLead || intent.requestTopicSwitch;
  const eligibleLowSignalTopic = intent.lowSignalTopicCue
    && input.riskLevel === "low"
    && !intent.requestAdvice && !intent.requestOrganize && !intent.directActionRequest
    && !intent.dependencyBoundaryRequest && !intent.capabilityBoundaryRequest
    && input.state.supportNeed < 0.6 && input.signals.supportSeekingScore < 0.6
    && input.signals.taskPressureScore < 0.6;
  const clearDistressTurn = /(?:其实|但是|不过)?.{0,6}(?:很难受|撑不住|崩溃|绝望|害怕|痛苦|焦虑|想哭|出事了)/u.test(input.text)
    || input.state.supportNeed >= 0.65 || input.state.arousal >= 0.7 || input.state.valence <= -0.6;
  if (!intent.requestOrganize && !intent.requestAdvice && (explicitTopicRequest || eligibleLowSignalTopic || (topicLeadActive && !intent.requestTopicStop && !clearDistressTurn))) {
    const strategy = intent.requestTopicSwitch ? "switch_topic" : topicLeadActive && !intent.requestTopicLead && !eligibleLowSignalTopic ? "continue_topic" : "open_topic";
    const reason = intent.requestTopicSwitch ? "USER_REQUESTED_TOPIC_SWITCH" : intent.requestTopicLead ? "USER_REQUESTED_TOPIC_LEAD" : eligibleLowSignalTopic ? "LOW_SIGNAL_TOPIC_CUE" : "TOPIC_LEAD_CONTINUATION";
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "converse", sceneState: "surface_chat",
      primaryStrategy: strategy, allowActionDraft: false, routeReasonCodes: [reason], lockTurnsRemaining: 0,
      allowedContent: ["一个具体轻松话题", "鹿禅自己的一点内容贡献", "最多一个自然问题"],
      forbiddenContent: ["分析用户为什么无聊", "只采访用户", "整理邀请", "具体行动", "诊断", "内部模式名称"],
    }, 0);
  }

  if (intent.requestNoQuestions) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
      allowActionDraft: false, routeReasonCodes: ["USER_REQUESTED_NO_QUESTIONS"], lockTurnsRemaining: 2,
      allowedContent: ["具体回应", "允许继续表达或沉默"], forbiddenContent: ["建议", "任务", "提问", "重复邀请", "诊断"],
    }, 2);
  }

  if (guidanceState.transitionInvitePending) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: "blend_to_deep", supportMode: "validate", sceneState: "underwater_companion",
      primaryStrategy: "specific_reflection", allowActionDraft: false, routeReasonCodes: ["TRANSITION_INVITE_EXPIRED"], lockTurnsRemaining: 0,
      allowedContent: ["承接用户转向的新内容", "复述", "允许稍后再谈整理"], forbiddenContent: ["具体行动", "重复邀请", "催促", "诊断"],
    }, 0);
  }

  if (input.signals.expressionClarityScore < 0.45) {
    const stopClarifying = guidanceState.clarifyAttemptCount >= 2;
    const mayInvite = !stopClarifying && !guidanceState.transitionDeclined && input.signals.progressReadinessScore >= 0.45;
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "clarify", sceneState: "quiet_water",
      primaryStrategy: stopClarifying ? "pause_low_signal" : mayInvite ? "clarify_then_invite" : "clarify_low_signal",
      allowActionDraft: false,
      routeReasonCodes: [stopClarifying ? "CLARIFY_LIMIT_REACHED" : mayInvite ? "LOW_CLARITY_WEAK_READINESS" : "LOW_EXPRESSION_CLARITY"],
      lockTurnsRemaining: 0,
      allowedContent: stopClarifying ? ["承认一时说不清", "允许暂停", "一个无需回答的非强迫选项"] : ["承认一时说不清", "一种低门槛表达脚手架", ...(mayInvite ? ["一次可拒绝的低压整理邀请"] : [])],
      forbiddenContent: ["具体行动", "多个问题", "治疗化解释", "误判用户没有需求", "催促"],
    }, 0);
  }

  if (intent.requestOrganize && input.currentSpirit === "shore_pick") {
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: "steady", supportMode: "mobilize", sceneState: "surface_organize",
      primaryStrategy: "one_small_action", allowActionDraft: true, routeReasonCodes: ["SHORE_EXPLICIT_CONTINUATION"], lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一个卡点", "一个可修改的低负担行动"], forbiddenContent: ["多任务清单", "催促", "诊断"],
    }, 0);
  }

  if (intent.requestOrganize || input.signals.progressReadinessScore >= 0.7) {
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: "blend_to_shore", supportMode: "clarify", sceneState: "near_surface_transition",
      primaryStrategy: "invite_one_small_action", allowActionDraft: false,
      routeReasonCodes: [intent.requestOrganize ? "USER_REQUESTED_ORGANIZE" : "HIGH_PROGRESS_READINESS"], lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一次低压且可拒绝的整理邀请"], forbiddenContent: ["未经确认的具体行动", "多个选项", "重复邀请", "催促", "诊断"],
    }, 0);
  }

  if (input.companionLockTurns > 0) {
    const remaining = input.companionLockTurns - 1;
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: "steady", supportMode: "validate",
      sceneState: "underwater_companion", primaryStrategy: "specific_reflection", allowActionDraft: false,
      routeReasonCodes: ["COMPANION_LOCK"], lockTurnsRemaining: remaining,
      allowedContent: ["具体承接", "复述", "澄清"], forbiddenContent: ["未经请求的建议", "任务清单", "诊断"],
    }, remaining);
  }

  if (input.state.arousal >= 0.75 || input.state.supportNeed >= 0.7) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "stabilize", sceneState: "underwater_companion", primaryStrategy: "validate_and_clarify",
      allowActionDraft: false, routeReasonCodes: ["HIGH_SUPPORT_NEED"], lockTurnsRemaining: 0,
      allowedContent: ["具体承接", "降低节奏", "现实支持"],
      forbiddenContent: ["立即解决", "任务清单", "依赖强化", "诊断"],
    }, 0);
  }

  if (arousalRise >= 0.15) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
      allowActionDraft: false, routeReasonCodes: ["AROUSAL_RISE"], lockTurnsRemaining: 0,
      allowedContent: ["具体承接", "复述"], forbiddenContent: ["任务", "催促", "诊断"],
    }, 0);
  }

  const autoOrganize = Boolean(input.wasRecentlySupported) && input.signals.taskPressureScore >= 0.55 && input.state.cognitiveOverload >= 0.5;
  if (autoOrganize) {
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: "blend_to_shore",
      supportMode: "clarify", sceneState: "near_surface_transition",
      primaryStrategy: "invite_one_small_action", allowActionDraft: false,
      routeReasonCodes: ["SUPPORTED_TASK_OVERLOAD"], lockTurnsRemaining: 0,
      allowedContent: ["一句具体承接", "一次低压且可拒绝的整理邀请"], forbiddenContent: ["未经确认的具体行动", "多个任务", "催促", "诊断", "依赖强化"],
    }, 0);
  }

  return finalize(input, {
    ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
    supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
    allowActionDraft: false, routeReasonCodes: ["DEFAULT_COMPANION"], lockTurnsRemaining: 0,
    allowedContent: ["具体承接", "复述", "最多一个澄清问题"], forbiddenContent: ["未经请求的建议", "任务清单", "空泛鸡汤", "诊断"],
  }, 0);
}
