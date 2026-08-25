import type { TopicSkillGuidanceStateV1 } from "@otter/shared";
import { astrologySkill, ASTROLOGY_SKILL_VERSION } from "./astrology/skill.js";
import { classifyMonthDay, mentionedSigns } from "./astrology/knowledge.js";
import { SKILL_HARNESS_VERSION, type SkillDiagnostics, type SkillResolution } from "./types.js";

const deterministicMarker = /(?:一定|注定|必然|绝对|百分之百|命中注定|天生就是)/gu;
const highStakesAdvice = /(?:因为|按照|从).{0,10}(?:星座|运势|八字|命理|五行|卦象|风水).{0,18}(?:应该|必须|最好|可以).{0,12}(?:辞职|分手|离婚|投资|买|卖|手术|停药|治疗)/u;
const scienceClaim = /(?:科学证明|医学证明|心理学证明|已经证实).{0,14}(?:星座|占星|八字|命理|风水|周易)/u;
const unsupportedPlacement = /(?:你的|你是|你命里).{0,8}(?:上升|月亮|第.{0,3}宫|宫位|相位|日主|十神|大运|流年|命宫|五行缺).{0,8}(?:是|在|落在|有|缺)/u;
const fatalism = /(?:灾难|血光之灾|厄运|逃不掉|劫数|会死|克死|不祥)/u;
const disagreementOverride = /(?:你不懂自己|你只是没意识到|星座不会错|命盘不会错|八字不会错|迟早会发现我说得对)/u;

export function validateSkillReply(input: { reply: string; actionDraft: string | null; resolution: SkillResolution; optedOut: boolean; userText?: string }): string[] {
  if (input.resolution.status !== "active") return [];
  const violations: string[] = [];
  const deterministicClaim = [...input.reply.matchAll(deterministicMarker)].some((match) => {
    const before = input.reply.slice(Math.max(0, match.index - 8), match.index);
    const after = input.reply.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const negated = /(?:不|未|非|没有|并非|不会|不能|并不).{0,4}$/u.test(before);
    const claimsOutcome = /(?:是|会|导致|发生|成功|失败|分手|结婚|背叛|让)/u.test(after) || /(?:百分之百|命中注定|天生就是)/u.test(match[0]);
    return !negated && claimsOutcome;
  });
  if (deterministicClaim) violations.push("ASTROLOGY_DETERMINISTIC_CLAIM");
  if (highStakesAdvice.test(input.reply)) violations.push("ASTROLOGY_HIGH_STAKES_ADVICE");
  if (scienceClaim.test(input.reply)) violations.push("ASTROLOGY_SCIENCE_MISREPRESENTATION");
  if (unsupportedPlacement.test(input.reply)) violations.push("ASTROLOGY_UNSUPPORTED_PLACEMENT");
  if (fatalism.test(input.reply)) violations.push("ASTROLOGY_FATALISM_OR_FEAR");
  if (disagreementOverride.test(input.reply)) violations.push("ASTROLOGY_USER_DISAGREEMENT_OVERRIDDEN");
  if (input.optedOut) violations.push("ASTROLOGY_SKILL_AFTER_OPTOUT");
  if (input.actionDraft !== null) violations.push("SKILL_OVERRIDES_CORE_POLICY");
  const date = classifyMonthDay(input.userText ?? "");
  if (date.kind === "invalid") {
    const rejectsInvalidDate = /(?:不存在|没有|不是|无效|不合法).{0,14}(?:日期|公历|月|日|星座)|(?:日期|公历|月|日).{0,14}(?:不存在|没有|无效|不合法)/u.test(input.reply);
    if (!rejectsInvalidDate || mentionedSigns(input.reply).length > 0) violations.push("ASTROLOGY_INVALID_DATE_FABRICATION");
  }
  return [...new Set(violations)];
}

export function fallbackForSkill(text: string, resolution: SkillResolution): string | null {
  if (resolution.skillId !== "astrology") return null;
  return astrologySkill.fallback({ text, resolution });
}

export function nextTopicSkillState(previous: TopicSkillGuidanceStateV1, resolution: SkillResolution, turnIndex: number): TopicSkillGuidanceStateV1 {
  if (resolution.reasonCodes.includes("ASTROLOGY_USER_OPTOUT")) {
    return { activeSkillId: null, activeVersion: null, lastActivatedTurn: previous.lastActivatedTurn, suspendedSkillIds: ["astrology"] };
  }
  if (resolution.status === "active" && resolution.skillId === "astrology") {
    return { activeSkillId: "astrology", activeVersion: ASTROLOGY_SKILL_VERSION, lastActivatedTurn: turnIndex, suspendedSkillIds: [] };
  }
  return { ...previous, activeSkillId: null, activeVersion: null, suspendedSkillIds: [...previous.suspendedSkillIds] };
}

export function buildSkillDiagnostics(resolution: SkillResolution, violationCodes: string[]): SkillDiagnostics {
  return {
    harnessVersion: SKILL_HARNESS_VERSION,
    skillId: resolution.skillId,
    skillVersion: resolution.skillVersion,
    status: resolution.status,
    capability: resolution.capability,
    activationSource: resolution.activationSource,
    reasonCodes: resolution.reasonCodes,
    violationCodes: violationCodes.filter((code) => code.startsWith("ASTROLOGY_") || code === "SKILL_OVERRIDES_CORE_POLICY"),
  };
}
