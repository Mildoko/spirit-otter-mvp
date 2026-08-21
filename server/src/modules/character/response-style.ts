import type { EmotionState, ExpressiveAccent, GuidanceStateV1, ResponsePlan, ResponseStyleProfile, ResponseStyleResolution, RiskLevel } from "@otter/shared";
import { z } from "zod";
import { DEFAULT_GUIDANCE_STATE } from "../support/guidance-state.js";

export const RESPONSE_STYLE_VERSION = "2026-08-20.1";

export const responseStyleProfileSchema = z.object({
  pace: z.enum(["very_slow", "slow", "steady", "direct"]), sentenceLength: z.enum(["short", "medium"]),
  responseLength: z.enum(["brief", "normal"]), warmth: z.enum(["restrained", "warm", "close"]),
  reflectionDepth: z.enum(["fact", "tension", "meaning"]), questionBudget: z.union([z.literal(0), z.literal(1)]),
  adviceDirectness: z.enum(["none", "tentative", "clear"]), uncertainty: z.enum(["low", "medium", "high"]),
  conversationality: z.enum(["restrained", "natural", "close"]), sentenceRhythm: z.enum(["compact", "mixed"]),
  expressiveAccent: z.enum(["none", "metaphor", "aphorism", "dry_humor"]),
}).strict();
export const responseStyleResolutionSchema = z.object({
  profile: responseStyleProfileSchema, reasonCodes: z.array(z.string().min(1)).min(1), avoidPhrases: z.array(z.string().min(1)),
  replyOutline: z.array(z.string().min(1)).min(1), styleVersion: z.string().min(1),
}).strict();

export const spiritStyleDefaults: Record<ResponsePlan["transitionStyle"] | "deep_tide" | "shore_pick", ResponseStyleProfile> = {
  deep_tide: { pace: "slow", sentenceLength: "medium", responseLength: "normal", warmth: "warm", reflectionDepth: "tension", questionBudget: 1, adviceDirectness: "none", uncertainty: "medium", conversationality: "natural", sentenceRhythm: "mixed", expressiveAccent: "none" },
  shore_pick: { pace: "steady", sentenceLength: "short", responseLength: "brief", warmth: "warm", reflectionDepth: "fact", questionBudget: 1, adviceDirectness: "clear", uncertainty: "medium", conversationality: "natural", sentenceRhythm: "compact", expressiveAccent: "none" },
  steady: { pace: "slow", sentenceLength: "medium", responseLength: "normal", warmth: "warm", reflectionDepth: "tension", questionBudget: 1, adviceDirectness: "none", uncertainty: "medium", conversationality: "natural", sentenceRhythm: "mixed", expressiveAccent: "none" },
  blend_to_shore: { pace: "steady", sentenceLength: "short", responseLength: "normal", warmth: "warm", reflectionDepth: "tension", questionBudget: 1, adviceDirectness: "tentative", uncertainty: "medium", conversationality: "natural", sentenceRhythm: "mixed", expressiveAccent: "none" },
  blend_to_deep: { pace: "slow", sentenceLength: "short", responseLength: "brief", warmth: "close", reflectionDepth: "tension", questionBudget: 0, adviceDirectness: "none", uncertainty: "medium", conversationality: "restrained", sentenceRhythm: "compact", expressiveAccent: "none" },
};

const stockPhrases = ["我理解你的感受", "听起来你", "你可以尝试", "保持积极", "一切都会好", "你只需要", "这很正常", "我会永远陪着你", "只有我懂你"];
const metaphorMarkers = ["水面", "潮", "岸", "漂浮", "捞起", "沉下", "落脚处", "堵在门口", "后台程序", "电量"];
const assistantText = (item: string) => item.replace(/^assistant:\s*/iu, "").trim();

export function detectRecentPatterns(recentContext: string[]): string[] {
  const replies = recentContext.filter((item) => item.startsWith("assistant:")).slice(-3).map(assistantText);
  const avoided = new Set<string>();
  const openings = replies.map((reply) => reply.split(/[，。！？!?]/u)[0]?.trim()).filter((value): value is string => Boolean(value && value.length >= 4));
  for (const opening of openings) if (openings.filter((item) => item === opening).length > 1) avoided.add(opening);
  for (const phrase of stockPhrases) if (replies.some((reply) => reply.includes(phrase))) avoided.add(phrase);
  if (replies.filter((reply) => metaphorMarkers.some((marker) => reply.includes(marker))).length >= 2) avoided.add("连续比喻");
  if (replies.filter((reply) => /[？?]/u.test(reply)).length >= 2) avoided.add("连续提问");
  return [...avoided];
}

function outlineFor(plan: ResponsePlan, profile: ResponseStyleProfile): string[] {
  if (["clarify_low_signal", "clarify_then_invite"].includes(plan.primaryStrategy)) return ["承认此刻难以说清", "只给一种低门槛表达脚手架", profile.questionBudget ? "最多一个核心问题" : "不用问题逼用户回答"];
  if (plan.primaryStrategy === "pause_low_signal") return ["停止追问", "允许暂停或只留一个无需回答的选项"];
  if (plan.transitionStyle === "blend_to_shore") return ["先具体接话", "只指出一个阻塞点", "发出一次可拒绝的邀请；本轮不创建行动"];
  if (plan.transitionStyle === "blend_to_deep") return ["停止推进和整理", "具体承接用户刚才的不适或拒绝", "不创建行动"];
  if (plan.activeSpirit === "shore_pick") return ["延续情绪语境", "只指出一个阻塞点", profile.adviceDirectness === "none" ? "不提出行动" : "最多提出一个可拒绝的微小行动"];
  return ["像成年朋友一样接住一个具体事实或冲突", "用暂时假设映照负担", profile.questionBudget ? "可选一个真正需要回答的问题" : "不提问"];
}

const turnsSince = (current: number, previous: number | null) => previous === null ? Number.POSITIVE_INFINITY : current - previous;
export function selectExpressiveAccent(input: { plan: ResponsePlan; state: EmotionState; riskLevel: RiskLevel; userText: string; guidanceState: GuidanceStateV1; enabled: boolean; expressionClarityScore?: number }): { accent: ExpressiveAccent; reason: string } {
  if (!input.enabled) return { accent: "none", reason: "EXPRESSION_V2_DISABLED" };
  if (input.expressionClarityScore !== undefined && input.expressionClarityScore < 0.45) return { accent: "none", reason: "LOW_CLARITY_NO_ACCENT" };
  if (["clarify_low_signal", "clarify_then_invite", "pause_low_signal"].includes(input.plan.primaryStrategy)) return { accent: "none", reason: "LOW_SIGNAL_NO_ACCENT" };
  if (input.plan.sceneState === "near_surface_transition") return { accent: "none", reason: "TRANSITION_NO_ACCENT" };
  if (input.riskLevel !== "low" || input.state.arousal >= 0.75 || input.state.cognitiveOverload >= 0.7 || input.plan.transitionStyle === "blend_to_deep") return { accent: "none", reason: "DISTRESS_RESTRAINT" };
  if (/(?:直接说|别绕弯|不要|别|不用|不想).{0,8}(?:比喻|隐喻|警句|金句|玩笑|幽默)/u.test(input.userText)) return { accent: "none", reason: "USER_BOUNDARY_NO_ACCENT" };
  const lastAny = Math.max(input.guidanceState.lastMetaphorTurn ?? -999, input.guidanceState.lastAphorismTurn ?? -999, input.guidanceState.lastHumorTurn ?? -999);
  if (input.guidanceState.turnIndex - lastAny <= 2) return { accent: "none", reason: "ACCENT_GENERIC_COOLDOWN" };
  if (/(?:一边.{0,20}一边|既.{0,20}又|想.{0,20}(?:但|可是|又))/u.test(input.userText) && turnsSince(input.guidanceState.turnIndex, input.guidanceState.lastAphorismTurn) >= 5) return { accent: "aphorism", reason: "CONTRADICTION_APHORISM" };
  if (input.plan.activeSpirit === "shore_pick" && input.state.stressLoad < 0.6 && /(?:任务|待办|邮件|汇报|工作|排队|堆)/u.test(input.userText) && turnsSince(input.guidanceState.turnIndex, input.guidanceState.lastHumorTurn) >= 5) return { accent: "dry_humor", reason: "LOW_DISTRESS_TASK_HUMOR" };
  if (/(?:堵|压|挤|空|乱|卡|沉|重|累|电量|脑子)/u.test(input.userText) && turnsSince(input.guidanceState.turnIndex, input.guidanceState.lastMetaphorTurn) >= 3) return { accent: "metaphor", reason: "USER_ANCHORED_METAPHOR" };
  return { accent: "none", reason: "NO_SEMANTIC_ACCENT_MATCH" };
}

export function resolveResponseStyle(input: { plan: ResponsePlan; state: EmotionState; recentContext: string[]; userText: string; riskLevel: RiskLevel; guidanceState?: GuidanceStateV1; expressionV2Enabled?: boolean; expressionClarityScore?: number }): ResponseStyleResolution {
  const { plan, state } = input;
  const guidanceState = input.guidanceState ?? DEFAULT_GUIDANCE_STATE;
  const base = plan.transitionStyle === "steady" ? spiritStyleDefaults[plan.activeSpirit] : spiritStyleDefaults[plan.transitionStyle];
  const profile: ResponseStyleProfile = { ...base };
  const reasonCodes = [`SPIRIT_${plan.activeSpirit.toUpperCase()}`, `TRANSITION_${plan.transitionStyle.toUpperCase()}`];
  const avoidPhrases = detectRecentPatterns(input.recentContext);
  const explicitQuestionBoundary = guidanceState.userRequestedNoQuestions || /(?:不要|别|不用|不想|先别).{0,6}(?:问|问题)/u.test(input.userText);
  if (!plan.allowActionDraft || plan.forbiddenContent.some((item) => /建议|步骤|行动|任务/u.test(item))) profile.adviceDirectness = "none";
  if (guidanceState.userRequestedNoQuestions || plan.forbiddenContent.some((item) => item === "提问")) profile.questionBudget = 0;
  if (/(?:不要|别|不用|不想|先别).{0,6}(?:问|问题)/u.test(input.userText)) { profile.questionBudget = 0; reasonCodes.push("USER_BOUNDARY_NO_QUESTION"); }
  if (/(?:不要|别|不用|不想|先别).{0,6}(?:建议|办法|步骤|整理|任务)/u.test(input.userText)) { profile.adviceDirectness = "none"; reasonCodes.push("USER_BOUNDARY_NO_ADVICE"); }
  if (input.riskLevel !== "low" || state.arousal >= 0.8 || state.cognitiveOverload >= 0.7 || plan.transitionStyle === "blend_to_deep") { Object.assign(profile, { conversationality: "restrained", sentenceRhythm: "compact", expressiveAccent: "none" }); reasonCodes.push("RESTRAINED_EXPRESSION"); }
  if (state.arousal >= 0.8) { Object.assign(profile, { pace: "very_slow", sentenceLength: "short", responseLength: "brief", questionBudget: 0, adviceDirectness: "none", reflectionDepth: "fact" }); reasonCodes.push("HIGH_AROUSAL_CONTAINMENT"); }
  if (state.cognitiveOverload >= 0.7) { Object.assign(profile, { sentenceLength: "short", responseLength: "brief", adviceDirectness: profile.adviceDirectness === "clear" ? "tentative" : profile.adviceDirectness }); reasonCodes.push("COGNITIVE_LOAD_REDUCTION"); }
  if (state.supportNeed >= 0.7) { profile.warmth = state.arousal >= 0.8 ? "warm" : "close"; reasonCodes.push("SUPPORT_NEED_WARMTH"); }
  const labels = new Set((state.emotionLabels ?? []).map((item) => item.label));
  if (labels.has("sadness") || labels.has("loneliness")) { profile.warmth = state.arousal >= 0.8 ? "warm" : "close"; reasonCodes.push("EMOTION_WARM_CONTAINMENT"); }
  if (labels.has("anxiety")) { profile.sentenceLength = "short"; profile.sentenceRhythm = "compact"; reasonCodes.push("ANXIETY_COMPLEXITY_REDUCTION"); }
  if ((state.control ?? 0.5) <= 0.3) {
    profile.questionBudget = 0;
    profile.adviceDirectness = profile.adviceDirectness === "clear" ? "tentative" : profile.adviceDirectness;
    reasonCodes.push("LOW_CONTROL_LOW_PRESSURE");
  }
  if (state.stressLoad >= 0.7 || state.valence <= -0.65) { profile.reflectionDepth = profile.reflectionDepth === "meaning" ? "tension" : profile.reflectionDepth; reasonCodes.push("DISTRESS_NO_REFRAME"); }
  if (state.confidence < 0.55) { profile.uncertainty = "high"; profile.reflectionDepth = "fact"; reasonCodes.push("LOW_CONFIDENCE_HYPOTHESIS"); }
  if (avoidPhrases.includes("连续提问")) profile.questionBudget = 0;
  if (plan.routeReasonCodes.includes("ELEVATED_RISK") && !explicitQuestionBoundary) {
    profile.questionBudget = 1;
    reasonCodes.push("ELEVATED_SAFETY_CHECK_REQUIRED");
  }
  const selected = selectExpressiveAccent({ plan, state, riskLevel: input.riskLevel, userText: input.userText, guidanceState, enabled: input.expressionV2Enabled ?? true, ...(input.expressionClarityScore !== undefined ? { expressionClarityScore: input.expressionClarityScore } : {}) });
  if (profile.conversationality !== "restrained") profile.expressiveAccent = selected.accent;
  reasonCodes.push(selected.reason);
  return responseStyleResolutionSchema.parse({ profile, reasonCodes, avoidPhrases, replyOutline: outlineFor(plan, profile), styleVersion: RESPONSE_STYLE_VERSION });
}
