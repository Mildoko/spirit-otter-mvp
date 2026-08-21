import type { TopicSkillDefinition, SkillCapability, SkillResolution } from "../types.js";
import { classifyMonthDay, conventionalSunSign, knowledgeForPrompt, mentionedSigns, parseMonthDay } from "./knowledge.js";

export const ASTROLOGY_SKILL_VERSION = "astrology-skill-v1.1";

const explicitTopic = /(?:星座|十二星座|什么座|哪.{0,2}座|火象|土象|风象|水象|太阳星座|水逆|运势|星盘|上升|月亮星座|宫位|相位|本命盘|配对|合不合|匹配)/u;
const signName = /(?:白羊|金牛|双子|巨蟹|狮子|处女|天秤|天蝎|射手|摩羯|水瓶|双鱼)(?:座)?/u;
const inquiry = /(?:聊聊|讲讲|说说|怎么看|是什么|为什么|特点|性格|区别|如何|合适|合不合|匹配|呢|吗|？|\?)/u;
const optOut = /(?:不聊|别聊|不要聊|不想聊|换个话题|先不说|别再说).{0,8}(?:星座|这个|了)?/u;
const distress = /(?:失恋|崩溃|绝望|撑不住|痛苦|焦虑|难受|想死|自杀|自残|伤害自己|压力很大|喘不过气)/u;
const highStakes = /(?:辞职|离婚|分手|投资|股票|彩票|中奖|买房|手术|治疗|用药|怀孕|生育|法律|官司|死亡|吉凶|运势|预测|会不会发生|该不该)/u;
const unsupportedChart = /(?:上升|月亮星座|宫位|相位|本命盘|完整星盘|出生时间|出生地点|几点出生)/u;
const reflective = /(?:性格|共情|像不像|不像|为什么我|自我|了解自己|怎么看我|我是不是)/u;
const compatibility = /(?:合不合|配不配|匹配|相处|恋爱|关系|适合在一起)/u;

function capabilityFor(text: string): SkillCapability {
  if (/(?:不准|诊断|心理问题)/u.test(text)) return "cultural_chat";
  if (parseMonthDay(text) && /(?:什么座|哪.{0,2}座|星座)/u.test(text)) return "sun_sign_lookup";
  if (compatibility.test(text)) return "compatibility_chat";
  if (reflective.test(text)) return "self_reflection";
  return "cultural_chat";
}

function resolution(input: Parameters<TopicSkillDefinition["resolve"]>[0]): SkillResolution {
  if (!input.enabled) return inactive("SKILL_DISABLED");
  const explicit = explicitTopic.test(input.text) || (signName.test(input.text) && inquiry.test(input.text));
  const previousActive = input.state.activeSkillId === "astrology" && !input.state.suspendedSkillIds.includes("astrology");
  if (optOut.test(input.text) && (previousActive || explicitTopic.test(input.text))) return blocked("ASTROLOGY_USER_OPTOUT", "explicit_request", 1);
  const continuation = previousActive && (signName.test(input.text) || explicitTopic.test(input.text) || /(?:你说得不准|你说的不准|不像|可我|但我)/u.test(input.text) || (/^(?:那|那么|它|他们|这个|这两个).{0,24}(?:呢|吗|怎么样|区别)?[？?]?$/u.test(input.text.trim())));
  const distressContextMention = signName.test(input.text) && distress.test(input.text) && !inquiry.test(input.text);
  if (!explicit && !continuation && !distressContextMention) return inactive(signName.test(input.text) ? "ASTROLOGY_INCIDENTAL_MENTION" : "NO_TOPIC_SKILL_MATCH");
  if (input.riskLevel !== "low") return blocked("ASTROLOGY_RISK_PREEMPTED", explicit ? "explicit_request" : "conversation_continuation", 1);
  if (distressContextMention) return inactive("ASTROLOGY_DISTRESS_CONTEXT_ONLY");
  const source = explicit ? "explicit_request" as const : "conversation_continuation" as const;
  if (highStakes.test(input.text)) return blocked("ASTROLOGY_HIGH_STAKES_BOUNDARY", source, 1);
  if (unsupportedChart.test(input.text)) return blocked("ASTROLOGY_PRECISE_CHART_UNAVAILABLE", source, 1);
  const capability = capabilityFor(input.text);
  const promptContext = [
    "## 受约束话题 Skill：西方十二星座",
    knowledgeForPrompt(input.text),
    `本轮能力=${capability}。先直接回答用户的星座问题，语气自然、轻松、有来有回；不要强行心理咨询化。整段最多出现一个问号，不能连续抛出两个问题。`,
    "如果用户只用‘这个、那个、它’继续追问而当前上下文没有具体对象，不要猜；用一句自然陈述说明需要具体对象，最多再问一个短问题。不要复述用户原句中的问号。",
    "知识回答不得使用‘建议你、你应该、你需要先、不妨、可以试试、第一步、接下来你可以、先去做’，不得把闲聊变成行动建议。不要从知识问题推断用户的情绪、兴趣、人格或心理状态。",
    "星座只能作为流行文化或自我观察的谈资，不是科学诊断、人格定论或命运预测。普通知识问答直接回答即可，不要每轮机械追加‘观察角度’或‘不要定型’式免责声明；只有涉及性格、关系、用户反驳或确定性结论时，才自然补一句边界并允许用户不同意。",
    "禁止运势、吉凶和高风险决策建议；禁止声称已计算上升、月亮、宫位、相位或完整星盘；禁止要求出生时间或地点。",
    capability === "self_reflection" ? "回应用户具体说法后再提供非确定性的观察角度。" : "知识问答先给答案，不需要先做情绪承接。",
  ].join("\n");
  return {
    status: "active", skillId: "astrology", skillVersion: ASTROLOGY_SKILL_VERSION,
    interactionMode: "casual_topic", capability, activationSource: source,
    confidence: explicit ? 0.98 : 0.85, reasonCodes: [explicit ? "ASTROLOGY_EXPLICIT_REQUEST" : "ASTROLOGY_CONTINUATION"],
    promptContext, suppressMemory: true,
  };
}

function inactive(reasonCode: string): SkillResolution {
  return { status: "inactive", skillId: null, skillVersion: null, interactionMode: "core_support", capability: null, activationSource: "none", confidence: 0, reasonCodes: [reasonCode], promptContext: null, suppressMemory: false };
}

function blocked(reasonCode: string, activationSource: SkillResolution["activationSource"], confidence: number): SkillResolution {
  return { status: "blocked", skillId: "astrology", skillVersion: ASTROLOGY_SKILL_VERSION, interactionMode: "core_support", capability: null, activationSource, confidence, reasonCodes: [reasonCode], promptContext: null, suppressMemory: true };
}

function fallback(input: { text: string; resolution: SkillResolution }): string {
  const { text, resolution: skill } = input;
  if (skill.reasonCodes.includes("ASTROLOGY_USER_OPTOUT")) return "好，我们不聊星座了。你想换到什么话题都可以。";
  if (skill.reasonCodes.includes("ASTROLOGY_HIGH_STAKES_BOUNDARY")) return "星座可以当作聊天和自我观察的角度，但不适合替你决定这类现实中的重要事情。更可靠的是看事实、风险和你真正想保护的东西；我也不会用运势替你下结论。";
  if (skill.reasonCodes.includes("ASTROLOGY_PRECISE_CHART_UNAVAILABLE")) return "这需要精确星盘计算，我现在没有这项能力，也不会编造你的上升、月亮、宫位或相位。如果只想聊十二星座的常见说法，我可以继续。";
  if (/(?:不准|不像|你更了解自己|我更了解自己)/u.test(text)) return "那就以你的真实体验为准，星座描述不该反过来规定你是谁。它最多提供一个可以拿来比较的文化模板，不符合的部分完全可以丢掉。";
  const date = classifyMonthDay(text);
  if (date.kind === "invalid") return `公历里没有有效的${date.month}月${date.day}日，所以这个日期没有对应的星座。`;
  if (date.kind === "valid") {
    const sign = conventionalSunSign(date.month, date.day);
    return date.boundary
      ? `按常见十二星座日期，${date.month}月${date.day}日在${sign.name}的边界附近。不同年份、时区和出生时刻可能影响精确太阳位置，所以这里只能给常见范围，不能冒充精确星盘。`
      : `按常见十二星座日期，${date.month}月${date.day}日通常是${sign.name}（${sign.dateRange}）。这属于流行文化里的太阳星座划分，不是性格定论。`;
  }
  const signs = mentionedSigns(text);
  if (signs.length) {
    const details = signs.map((sign) => `${sign.name}通常被归为${sign.element}象、${sign.modality}星座，常见话题是${sign.themes.join("、")}`).join("；");
    return `${details}。你更想聊它的性格印象，还是和其他星座的相处差异？`;
  }
  return "可以聊。你可以从一个具体星座、元素分类，或者某段关系里的相处差异开始；我会把它当作轻松的文化话题，不拿星座替你下定论。";
}

export const astrologySkill: TopicSkillDefinition = {
  id: "astrology",
  version: ASTROLOGY_SKILL_VERSION,
  capabilities: ["cultural_chat", "sun_sign_lookup", "self_reflection", "compatibility_chat"],
  resolve: resolution,
  fallback,
};
