import type { ActiveSpirit, EmotionState, GuidanceState, RawSignals, ResponsePlan, RiskLevel } from "@otter/shared";
import { DEFAULT_GUIDANCE_STATE } from "./guidance-state.js";

export interface ConversationIntent {
  refuseAdvice: boolean;
  requestAdvice: boolean;
  requestOrganize: boolean;
  directActionRequest: boolean;
  tentativeOrganize: boolean;
  stopOrganizing: boolean;
  acceptedTransition: boolean;
  declinedTransition: boolean;
  requestNoQuestions: boolean;
  allowQuestions: boolean;
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
}

export interface PolicyResult {
  plan: ResponsePlan;
  nextSpiritTurnCount: number;
  nextCompanionLockTurns: number;
}

const refuseAdvicePatterns = [/(?:别|不要|不用|先别).{0,8}(?:建议|办法|步骤|教我|解决)/, /(?:只|先|想).{0,5}(?:听我说|陪我|让我说|说说|聊聊)/];
const requestAdvicePatterns = [
  /(?:你|能不能|可以)?(?:给我|给点|有什么|有何).{0,8}(?:建议|意见|看法|方向|办法)/u,
  /(?:你觉得|你怎么看|换作是你|如果是你)/u,
  /(?:希望|需要|请).{0,10}(?:你给我指路|给个方向|给我建议|直接说说你的看法)/u,
];
const organizePatterns = [
  /(?:帮我|替我|一起).{0,8}(?:整理|理一理|理一下|梳理|排一下)/,
  /(?:想|需要|先).{0,8}(?:理出|理清|整理|梳理)(?:一个|一下|一点|出)?/,
  /(?:下一步|先做哪个|怎么办|从哪开始)/,
  /(?:帮我|只给我|只帮我).{0,12}(?:拆|缩成|找|给|捞).{0,10}(?:最小|一个|一步|开始|动作)/,
  /(?:只给我|只帮我).{0,16}(?:动作|开始点|一步)/,
  /直接给我.{0,10}(?:动作|一步|开始点)/,
  /(?:拆|缩成).{0,8}(?:一步|一个.{0,4}动作)/,
  /(?:再|更).{0,4}(?:轻|小|简单).{0,10}(?:一点|一些|愿意试|可以试)/,
];
const stopPatterns = [/(?:算了|停一下|先不弄|不想整理|更烦了|别再列)/, /(?:不|不用|无需|别).{0,8}(?:帮我)?(?:整理|理一理|梳理)/];
const directActionPatterns = [
  /(?:拆|缩成).{0,8}(?:一个)?(?:最小)?动作/,
  /(?:只给我|只帮我).{0,12}(?:一个|开始|动作|开始点)/,
  /(?:今天|现在).{0,8}(?:能开始|可以开始).{0,6}(?:动作|一步)?/,
  /(?:一个|最小).{0,6}(?:能开始|开始点|小动作|动作)/,
  /直接给我.{0,10}(?:动作|一步|开始点)/,
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

export function detectConversationIntent(text: string, guidanceState: GuidanceState = DEFAULT_GUIDANCE_STATE): ConversationIntent {
  const refuseAdvice = refuseAdvicePatterns.some((pattern) => pattern.test(text));
  const requestAdvice = !refuseAdvice && requestAdvicePatterns.some((pattern) => pattern.test(text));
  const requestsLighterAction = /(?:如果|要是)?.{0,8}(?:再|更).{0,4}(?:轻|小|简单).{0,10}(?:愿意|可以|试)/u.test(text);
  const rejectsCurrentWeight = /(?:还是|有点|太).{0,5}(?:重|难)|接不住/u.test(text);
  const stopOrganizing = stopPatterns.some((pattern) => pattern.test(text)) || (rejectsCurrentWeight && !requestsLighterAction);
  const requestOrganize = !refuseAdvice && !stopOrganizing && organizePatterns.some((pattern) => pattern.test(text));
  const tentativeOrganize = requestOrganize && tentativeOrganizePatterns.some((pattern) => pattern.test(text));
  const directActionRequest = requestOrganize && !tentativeOrganize && directActionPatterns.some((pattern) => pattern.test(text));
  const inviteIsCurrent = guidanceState.transitionInvitePending && guidanceState.lastTransitionInviteTurn === guidanceState.turnIndex;
  const acceptedTransition = inviteIsCurrent && acceptancePatterns.some((pattern) => pattern.test(text));
  const declinedTransition = inviteIsCurrent && declineTransitionPatterns.some((pattern) => pattern.test(text));
  const requestNoQuestions = noQuestionPatterns.some((pattern) => pattern.test(text));
  const allowQuestions = allowQuestionPatterns.some((pattern) => pattern.test(text));
  return { refuseAdvice, requestAdvice, requestOrganize, directActionRequest, tentativeOrganize, stopOrganizing, acceptedTransition, declinedTransition, requestNoQuestions, allowQuestions };
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

  if (intent.refuseAdvice || intent.stopOrganizing || intent.declinedTransition || intent.requestNoQuestions || (guidanceState.userRequestedNoQuestions && !intent.allowQuestions)) {
    const reason = intent.requestNoQuestions || (guidanceState.userRequestedNoQuestions && !intent.allowQuestions)
      ? "USER_REQUESTED_NO_QUESTIONS"
      : intent.declinedTransition ? "USER_DECLINED_TRANSITION" : intent.refuseAdvice ? "USER_REFUSED_ADVICE" : "USER_STOPPED_ORGANIZING";
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
      allowActionDraft: false, routeReasonCodes: [reason], lockTurnsRemaining: 2,
      allowedContent: ["具体承接", "复述", "允许沉默"], forbiddenContent: ["建议", "任务", "提问", "重复邀请", "诊断"],
    }, 2);
  }

  if (input.riskLevel === "elevated") {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "stabilize", sceneState: "underwater_companion", primaryStrategy: "validate_and_clarify",
      allowActionDraft: false, routeReasonCodes: ["ELEVATED_RISK"], lockTurnsRemaining: 0,
      allowedContent: ["具体承接", "降低节奏", "轻量确认当前是否安全或是否有人可联系", "现实支持"],
      forbiddenContent: ["立即解决", "任务清单", "依赖强化", "诊断", "警句", "幽默"],
    }, 0);
  }

  if (intent.requestAdvice) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "answer_requested_advice",
      allowActionDraft: false, routeReasonCodes: ["USER_REQUESTED_ADVICE"], lockTurnsRemaining: 0,
      allowedContent: ["先接住具体情绪或矛盾", "直接回答用户的问题", "一条有理由且可拒绝的建议或真实看法"],
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

  if ((intent.requestOrganize || input.signals.progressReadinessScore >= 0.7) && input.currentSpirit === "shore_pick") {
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
  const shouldOrganize = autoOrganize || (input.currentSpirit === "shore_pick" && input.spiritTurnCount < 2);
  if (shouldOrganize) {
    const entering = input.currentSpirit === "deep_tide";
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: entering ? "blend_to_shore" : "steady",
      supportMode: "mobilize", sceneState: entering ? "near_surface_transition" : "surface_organize",
      primaryStrategy: "one_small_action", allowActionDraft: !entering,
      routeReasonCodes: [autoOrganize ? "SUPPORTED_TASK_OVERLOAD" : "SHORE_MIN_TURNS"], lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一个卡点", "一个可修改的小行动"], forbiddenContent: ["多个任务", "催促", "诊断", "依赖强化"],
    }, 0);
  }

  return finalize(input, {
    ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
    supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
    allowActionDraft: false, routeReasonCodes: ["DEFAULT_COMPANION"], lockTurnsRemaining: 0,
    allowedContent: ["具体承接", "复述", "最多一个澄清问题"], forbiddenContent: ["未经请求的建议", "任务清单", "空泛鸡汤", "诊断"],
  }, 0);
}
