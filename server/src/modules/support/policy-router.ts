import type { ActiveSpirit, EmotionState, RawSignals, ResponsePlan, RiskLevel } from "@otter/shared";

export interface ConversationIntent {
  refuseAdvice: boolean;
  requestOrganize: boolean;
  stopOrganizing: boolean;
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
}

export interface PolicyResult {
  plan: ResponsePlan;
  nextSpiritTurnCount: number;
  nextCompanionLockTurns: number;
}

const refuseAdvicePatterns = [/(?:别|不要|不用|先别).{0,8}(?:建议|办法|步骤|教我|解决)/, /(?:只|先|想).{0,5}(?:听我说|陪我|让我说|说说|聊聊)/];
const organizePatterns = [
  /(?:帮我|替我|一起).{0,8}(?:整理|理一理|理一下|梳理|排一下)/,
  /(?:想|需要|先).{0,8}(?:理出|理清|整理|梳理)(?:一个|一下|一点|出)?/,
  /(?:下一步|先做哪个|怎么办|从哪开始)/,
];
const stopPatterns = [/(?:算了|停一下|先不弄|不想整理|更烦了|别再列)/, /(?:不|不用|无需|别).{0,8}(?:帮我)?(?:整理|理一理|梳理)/];

export function detectConversationIntent(text: string): ConversationIntent {
  const refuseAdvice = refuseAdvicePatterns.some((pattern) => pattern.test(text));
  const stopOrganizing = stopPatterns.some((pattern) => pattern.test(text));
  const requestOrganize = !refuseAdvice && !stopOrganizing && organizePatterns.some((pattern) => pattern.test(text));
  return { refuseAdvice, requestOrganize, stopOrganizing };
}

function finalize(input: PolicyInput, plan: ResponsePlan, lock: number): PolicyResult {
  const changed = plan.activeSpirit !== input.currentSpirit;
  return { plan, nextSpiritTurnCount: changed ? 1 : input.spiritTurnCount + 1, nextCompanionLockTurns: lock };
}

export function chooseResponsePlan(input: PolicyInput): PolicyResult {
  const intent = detectConversationIntent(input.text);
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

  if (intent.refuseAdvice || intent.stopOrganizing) {
    const reason = intent.refuseAdvice ? "USER_REFUSED_ADVICE" : "USER_STOPPED_ORGANIZING";
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "validate", sceneState: "underwater_companion", primaryStrategy: "specific_reflection",
      allowActionDraft: false, routeReasonCodes: [reason], lockTurnsRemaining: 2,
      allowedContent: ["具体承接", "复述", "允许沉默"], forbiddenContent: ["建议", "任务", "连续提问", "诊断"],
    }, 2);
  }

  // A new, explicit request to organize is a fresh user boundary and may
  // override an earlier companion lock. The first shore turn only blends and
  // never creates an action.
  if (intent.requestOrganize) {
    const entering = input.currentSpirit === "deep_tide";
    return finalize(input, {
      ...base, activeSpirit: "shore_pick", transitionStyle: entering ? "blend_to_shore" : "steady",
      supportMode: "mobilize", sceneState: entering ? "near_surface_transition" : "surface_organize",
      primaryStrategy: "one_small_action", allowActionDraft: !entering && input.spiritTurnCount >= 1,
      routeReasonCodes: ["USER_REQUESTED_ORGANIZE"], lockTurnsRemaining: 0,
      allowedContent: ["一句情绪承接", "一个卡点", "澄清一个优先级"],
      forbiddenContent: ["多任务清单", "催促", "诊断", "依赖强化"],
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

  if (input.riskLevel === "elevated" || input.state.arousal >= 0.75 || input.state.supportNeed >= 0.7) {
    return finalize(input, {
      ...base, activeSpirit: "deep_tide", transitionStyle: input.currentSpirit === "shore_pick" ? "blend_to_deep" : "steady",
      supportMode: "stabilize", sceneState: "underwater_companion", primaryStrategy: "validate_and_clarify",
      allowActionDraft: false, routeReasonCodes: [input.riskLevel === "elevated" ? "ELEVATED_RISK" : "HIGH_SUPPORT_NEED"], lockTurnsRemaining: 0,
      allowedContent: ["具体承接", "降低节奏", "现实支持"], forbiddenContent: ["立即解决", "任务清单", "依赖强化", "诊断"],
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
