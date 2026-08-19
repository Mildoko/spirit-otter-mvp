import type { EmotionHypothesisV1, EmotionLabelV1, ResponsePlan, ResponseStyleResolution } from "@otter/shared";
import { adviceMarkers, aphorismMarkers, bannedReplyPhrases, dependencyPhrases, detectDeliveredAccents, diagnosisPhrases, everydayMetaphorMarkers, mentorPhrases, waterMetaphorMarkers } from "./language-registry.js";

export type ReplyViolationSeverity = "hard" | "soft";
export interface ReplyViolation { code: string; severity: ReplyViolationSeverity }
export interface ReplyValidationResult {
  ok: boolean;
  hardValid: boolean;
  violations: ReplyViolation[];
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function meaningfulAnchors(userText: string): string[] {
  const compact = userText.replace(/[\s，。！？、,.!?；;：“”‘’"']/gu, "");
  const anchors = new Set<string>();
  for (let length = 4; length >= 2; length -= 1) {
    for (let index = 0; index <= compact.length - length; index += 1) {
      const value = compact.slice(index, index + length);
      if (!/^(今天|现在|真的|感觉|觉得|有点|一下|一个|什么|怎么)$/u.test(value)) anchors.add(value);
    }
    if (anchors.size >= 30) break;
  }
  return [...anchors];
}

function firstClause(text: string): string {
  return text.trim().split(/[，。！？!?]/u)[0]?.trim() ?? "";
}

const emotionTerms: Record<EmotionLabelV1, string[]> = {
  joy: ["开心", "高兴", "喜悦"], relief: ["释然", "轻松"], hope: ["希望", "期待"], interest: ["兴趣", "好奇"], gratitude: ["感激", "感谢"],
  sadness: ["悲伤", "难过", "伤心", "委屈"], anger: ["愤怒", "生气", "恼火"], anxiety: ["焦虑", "害怕", "恐惧", "不安"],
  frustration: ["挫败", "受挫"], disappointment: ["失望"], disgust: ["厌恶", "反感"], shame: ["羞耻", "羞愧"], guilt: ["内疚", "愧疚"], loneliness: ["孤独", "寂寞"], surprise: ["惊讶", "意外"],
};

function assertedEmotionLabels(reply: string): EmotionLabelV1[] {
  const asserted = new Set<EmotionLabelV1>();
  for (const [label, terms] of Object.entries(emotionTerms) as Array<[EmotionLabelV1, string[]]>) {
    if (terms.some((term) => new RegExp(`(?:你|这就是你|说明你).{0,8}${term}`, "u").test(reply))) asserted.add(label);
  }
  return [...asserted];
}

export function validateGeneratedReply(input: {
  reply: string;
  actionDraft: string | null;
  plan: ResponsePlan;
  style: ResponseStyleResolution;
  emotionHypothesis?: EmotionHypothesisV1;
  userText: string;
  recentContext: string[];
}): ReplyValidationResult {
  const { reply, actionDraft, plan, style } = input;
  const violations: ReplyViolation[] = [];
  const add = (code: string, severity: ReplyViolationSeverity) => {
    if (!violations.some((item) => item.code === code)) violations.push({ code, severity });
  };
  const questionCount = countMatches(reply, /[？?]/gu);
  const sentenceCount = reply.split(/[。！？!?]+/u).map((part) => part.trim()).filter(Boolean).length;
  const metaphorCount = [...waterMetaphorMarkers, ...everydayMetaphorMarkers].filter((marker) => reply.includes(marker)).length;
  const deliveredAccents = detectDeliveredAccents(reply);
  const emotionHypothesis = input.emotionHypothesis;
  const assertedLabels = assertedEmotionLabels(reply);
  const supportedLabels = new Set(emotionHypothesis?.labels.map((item) => item.label) ?? []);

  if (bannedReplyPhrases.some((phrase) => reply.includes(phrase))) add("BANNED_PHRASE", "hard");
  if (dependencyPhrases.some((phrase) => reply.includes(phrase))) add("DEPENDENCY_LANGUAGE", "hard");
  if (diagnosisPhrases.some((phrase) => reply.includes(phrase))) add("DIAGNOSIS_LANGUAGE", "hard");
  if (/(?:你就是|说明你|这证明你).{0,12}(?:一种人|性格|人格|有病|心理问题)/u.test(reply)) add("DIAGNOSTIC_EMOTION_CLAIM", "hard");
  if (emotionHypothesis?.status === "unknown" && assertedLabels.length > 0) add("UNSUPPORTED_EMOTION_ASSERTION", "hard");
  if (emotionHypothesis?.status === "unknown" && /(?:你没有情绪|你很中性|你其实很平静)/u.test(reply)) add("UNKNOWN_TREATED_AS_NEUTRAL", "hard");
  if (emotionHypothesis && assertedLabels.some((label) => !supportedLabels.has(label))) {
    add(emotionHypothesis.status === "user_corrected" ? "CONTRADICTS_USER_CORRECTION" : "UNSUPPORTED_EMOTION_ASSERTION", "hard");
  }
  if (emotionHypothesis && assertedLabels.length > 0 && (emotionHypothesis.confidence < 0.55 || emotionHypothesis.labels.some((item) => item.evidenceSpans.length === 0))) add("EMOTION_LABEL_WITHOUT_EVIDENCE", "hard");
  if (questionCount > style.profile.questionBudget) add("QUESTION_BUDGET_EXCEEDED", "hard");
  if (!plan.allowActionDraft && actionDraft !== null) add("UNAUTHORIZED_ACTION", "hard");
  if (actionDraft && actionDraft.length > 60) add("ACTION_TOO_LONG", "hard");
  if (plan.activeSpirit === "deep_tide" && plan.primaryStrategy !== "answer_requested_advice" && adviceMarkers.some((marker) => reply.includes(marker))) add("DEEP_TIDE_DIRECT_ADVICE", "hard");
  if (plan.primaryStrategy === "answer_requested_advice") {
    const answersWithAdvice = /(?:我的建议|我会建议|我更倾向|我觉得|我的看法|不妨|可以试试|可以先|先把|更值得)/u.test(reply);
    const defersAnswer = /(?:先让.{0,10}(?:落在|停在)|不把它翻译成办法|先不急着给.{0,4}建议|先不添办法|更想先陪你)/u.test(reply);
    if (!answersWithAdvice) add("REQUESTED_ADVICE_MISSING", "hard");
    if (defersAnswer) add("REQUESTED_ADVICE_DEFERRED", "hard");
  }
  if (["invite_one_small_action", "clarify_then_invite"].includes(plan.primaryStrategy)) {
    const hasActionLeak = /(?:打开|写下|回复).{0,18}(?:邮件|文档|一句|开头)/u.test(reply) || /(?:先做|第一步).{0,12}(?:是|：|:|可以)/u.test(reply) || /(?:动作|一步).{0,12}(?:是|可以是|试试)/u.test(reply);
    const hasLowPressureInvite = /(?:如果你愿意|要不要|愿不愿意|是否愿意|可以由你决定|也可以先不)/u.test(reply);
    if (hasActionLeak) add("ACTION_BEFORE_ACCEPTANCE", "hard");
    if (!hasLowPressureInvite) add("TRANSITION_INVITE_MISSING", "hard");
  }
  if (!["invite_one_small_action", "clarify_then_invite"].includes(plan.primaryStrategy) && /(?:如果你愿意|要不要|愿不愿意).{0,18}(?:整理|行动|往前|试试)/u.test(reply)) add("UNAUTHORIZED_TRANSITION_INVITE", "hard");
  if (plan.routeReasonCodes.includes("ELEVATED_RISK") && !/(?:现在|此刻).{0,6}(?:安全|有人陪)|身边.{0,10}(?:联系|可信任|陪)|是否.{0,4}安全/u.test(reply)) {
    add("ELEVATED_SAFETY_CHECK_MISSING", "hard");
  }
  if (deliveredAccents.length > 1) add("MULTIPLE_EXPRESSIVE_ACCENTS", "hard");
  if (style.profile.expressiveAccent === "none" && deliveredAccents.length > 0) add("EXPRESSIVE_ACCENT_FORBIDDEN", "hard");
  if (deliveredAccents.length === 1 && deliveredAccents[0] !== style.profile.expressiveAccent) add("EXPRESSIVE_ACCENT_MISMATCH", "hard");
  if (plan.routeReasonCodes.includes("ELEVATED_RISK") && deliveredAccents.some((accent) => accent === "aphorism" || accent === "dry_humor")) add("RISK_EXPRESSIVE_ACCENT_LEAK", "hard");
  if (metaphorCount > 1) add("METAPHOR_LIMIT_EXCEEDED", "hard");
  if (sentenceCount > 5 || reply.length > 500) add("REPLY_TOO_LONG", "hard");
  if (sentenceCount < 2) add("REPLY_TOO_BRIEF", "soft");

  const recentReplies = input.recentContext.filter((item) => item.startsWith("assistant:")).slice(-3).map((item) => item.replace(/^assistant:\s*/iu, ""));
  const opening = firstClause(reply);
  if (opening.length >= 4 && recentReplies.some((item) => firstClause(item) === opening)) add("REPEATED_OPENING", "soft");
  if (style.avoidPhrases.some((phrase) => phrase !== "连续比喻" && phrase !== "连续提问" && reply.includes(phrase))) add("RECENT_PATTERN_REUSED", "soft");
  const anchors = meaningfulAnchors(input.userText);
  if (anchors.length > 0 && !anchors.some((anchor) => reply.includes(anchor))) add("MISSING_CONCRETE_ANCHOR", "soft");
  if (deliveredAccents.includes("metaphor") && !/(?:堵|压|挤|空|乱|卡|沉|重|累|电量|脑子|任务|工作)/u.test(input.userText)) add("UNANCHORED_METAPHOR", "soft");
  if (deliveredAccents.includes("aphorism") && (mentorPhrases.some((phrase) => reply.includes(phrase)) || !/(?:一边|既|又|但|可是|矛盾)/u.test(input.userText))) add("UNSUPPORTED_APHORISM", "soft");
  if (aphorismMarkers.some((marker) => recentReplies.some((recent) => recent.includes(marker)) && reply.includes(marker))) add("REPEATED_APHORISM", "soft");
  if (/(?:综上所述|总而言之|从你的描述来看|首先.{0,10}其次)/u.test(reply)) add("FORMAL_SUMMARY_TONE", "soft");
  if (/(嗯嗯|其实吧|怎么说呢).*(?:嗯嗯|其实吧|怎么说呢)/u.test(reply)) add("REPEATED_FILLER", "soft");
  if (["clarify_low_signal", "clarify_then_invite"].includes(plan.primaryStrategy) && !/(?:一个词|一小段|今天|刚才|更像|选一个|说不清|不用完整)/u.test(reply)) add("LOW_SIGNAL_SCAFFOLD_MISSING", "soft");

  return {
    ok: violations.length === 0,
    hardValid: !violations.some((item) => item.severity === "hard"),
    violations,
  };
}
