import type { EmotionState, GuidanceStateV4, HealingBriefV1, HealingDepth, HealingGoal, HealingRupture, RealityPressure, RiskLevel } from "@otter/shared";

export type HealingScenario = "material" | "work" | "relationship" | "loneliness" | "shame" | "responsibility" | "grief" | "anger" | "numbness" | "rupture" | "general";

const ruptureRules: Array<{ rupture: Exclude<HealingRupture, "none">; pattern: RegExp }> = [
  { rupture: "too_abstract", pattern: /(?:太空|空话|套话|鸡汤|什么出口|别说这些虚的)/u },
  { rupture: "too_light", pattern: /(?:说轻了|太轻描淡写|没那么简单|不是小事)/u },
  { rupture: "misread", pattern: /(?:你.{0,4}没懂|你不明白|理解错了|说偏了|不是这个意思|根本不是)/u },
  { rupture: "unwanted_advice", pattern: /(?:你又|刚才).{0,8}(?:建议|教我|给办法|让我做)/u },
  { rupture: "not_helpful", pattern: /(?:没帮助|没有帮助|没用|解决不了|帮不到|并没有.{0,6}(?:好一点|用)|绕圈圈|一直(?:在)?重复|还是那句话|没往前走|和你(?:沟通|聊天|聊).{0,6}无聊)/u },
];

const materialPattern = /(?:工资|生活费|房租|房贷|欠债|没钱|缺钱|借钱|发不出工资|失业|裁员|吃饭|基本生活|交不起|住不起|经济|现金流|水电费|医药费)/u;
const workPattern = /(?:工作|上班|老板|公司|同事|汇报|绩效|试用期|离职|辞职|项目)/u;
const relationshipPattern = /(?:分手|离婚|伴侣|男朋友|女朋友|喜欢的人|关系|背叛|被拒绝|不爱我)/u;
const lonelinessPattern = /(?:没人|没有人|无人|孤独|寂寞|没什么人.{0,6}(?:倾诉|说话)|只能自己)/u;
const shamePattern = /(?:没用|失败|丢脸|羞耻|矫情|拖累|不争气|都是我的错|怪我)/u;
const responsibilityPattern = /(?:家里|父母|孩子|照顾|养家|责任|全靠我|指望我|拖累家人)/u;
const griefPattern = /(?:去世|离世|失去|再也见不到|葬礼|怀念|想念.*(?:他|她|它))/u;
const angerPattern = /(?:生气|愤怒|气死|凭什么|不公平|恶心|恨)/u;
const numbnessPattern = /(?:没感觉|麻木|空空的|什么都感觉不到|不想说|脑子空|说不上来)/u;
const deepOptOutPattern = /(?:别|不要|不用|停止|先别).{0,8}(?:分析|解读|揣测|深挖)|(?:只|先).{0,4}(?:听我说|听着|陪我说)/u;
const deepOptInPattern = /(?:可以|继续|你可以).{0,8}(?:分析|深入|说说你的理解)|(?:我想|帮我).{0,8}(?:看清|理解).{0,8}(?:自己|这件事)/u;

export function detectHealingRupture(text: string): HealingRupture {
  return ruptureRules.find((item) => item.pattern.test(text))?.rupture ?? "none";
}

export function detectHealingScenario(text: string, rupture = detectHealingRupture(text)): HealingScenario {
  if (rupture !== "none") return "rupture";
  if (materialPattern.test(text)) return "material";
  if (griefPattern.test(text)) return "grief";
  if (relationshipPattern.test(text)) return "relationship";
  if (shamePattern.test(text)) return "shame";
  if (responsibilityPattern.test(text)) return "responsibility";
  if (lonelinessPattern.test(text)) return "loneliness";
  if (angerPattern.test(text)) return "anger";
  if (numbnessPattern.test(text)) return "numbness";
  if (workPattern.test(text)) return "work";
  return "general";
}

export function detectsDeepAnalysisOptOut(text: string): boolean {
  return deepOptOutPattern.test(text);
}

export function detectsDeepAnalysisOptIn(text: string): boolean {
  return deepOptInPattern.test(text);
}

export function detectRealityPressure(text: string): RealityPressure {
  if (!materialPattern.test(text)) return "none";
  return /(?:撑不了|不到|不够|快要|马上|这个月|下个月|月底|断了|发不出|交不起|没地方住|没饭吃)/u.test(text)
    ? "urgent_non_safety"
    : "present";
}

function primaryEvidence(text: string, scenario: HealingScenario): string[] {
  const patterns: Record<HealingScenario, RegExp[]> = {
    material: [/(?:工资|生活费|房租|借钱|没钱|缺钱|失业|基本生活)[^。！？!?]{0,28}/u],
    work: [/(?:工作|上班|公司|老板|绩效|试用期)[^。！？!?]{0,28}/u],
    relationship: [/(?:分手|离婚|伴侣|喜欢的人|关系|背叛|被拒绝)[^。！？!?]{0,28}/u],
    loneliness: [/(?:没人|没有人|孤独|寂寞|倾诉)[^。！？!?]{0,28}/u],
    shame: [/(?:没用|失败|丢脸|羞耻|矫情|拖累|不争气|都是我的错)[^。！？!?]{0,28}/u],
    responsibility: [/(?:家里|父母|孩子|照顾|养家|责任|全靠我)[^。！？!?]{0,28}/u],
    grief: [/(?:去世|离世|失去|再也见不到|怀念|想念)[^。！？!?]{0,28}/u],
    anger: [/(?:生气|愤怒|气死|凭什么|不公平|恶心|恨)[^。！？!?]{0,28}/u],
    numbness: [/(?:没感觉|麻木|空空的|什么都感觉不到|脑子空|说不上来)[^。！？!?]{0,28}/u],
    rupture: ruptureRules.map((item) => item.pattern),
    general: [/.{2,36}/u],
  };
  return patterns[scenario].flatMap((pattern) => text.match(pattern)?.[0]?.trim() ?? []).filter(Boolean).slice(0, 2);
}

function insightFor(scenario: HealingScenario): string | null {
  const insights: Record<HealingScenario, string | null> = {
    material: "最压人的可能不只是钱本身，而是基本生活的确定性和对家里的责任一起悬着。",
    work: "真正磨人的也许不只是工作难，而是投入之后仍无法确定自己能不能被公平对待。",
    relationship: "难受的可能不只是一段关系的变化，也包括原先相信的未来突然失去了落点。",
    loneliness: "孤独最重的部分也许不是身边没人，而是这么重的事一直找不到一个能共同承担现实的人。",
    shame: "你似乎正在把处境的失败全算成自己的失败，但这两件事并不等同。",
    responsibility: "你承担的可能已经超过一个人合理能扛的范围，却还在用是否扛得住评价自己。",
    grief: "失去带走的不只是一个人或一段关系，也带走了许多原本默认会继续发生的日常。",
    anger: "这股愤怒里可能有一部分是在保护那个被不公平对待、却一直没被认真看见的你。",
    numbness: "麻木有时不是没有感受，而是感受太多之后暂时没有余力再处理。",
    rupture: null,
    general: null,
  };
  return insights[scenario];
}

function goalFor(scenario: HealingScenario, realityPressure: RealityPressure, rupture: HealingRupture): HealingGoal {
  if (rupture !== "none") return "felt_seen";
  if (realityPressure !== "none") return "reality_bridge";
  if (["shame", "responsibility"].includes(scenario)) return "self_compassion";
  if (["grief", "relationship", "anger"].includes(scenario)) return "meaning_clarity";
  if (["numbness", "loneliness"].includes(scenario)) return "emotional_softening";
  return "felt_seen";
}

export function planHealingTurn(input: {
  text: string;
  riskLevel: RiskLevel;
  state: EmotionState;
  guidanceState: GuidanceStateV4;
  now: Date;
}): { brief: HealingBriefV1; scenario: HealingScenario; deepAnalysisEnabled: boolean } {
  const optOut = detectsDeepAnalysisOptOut(input.text);
  const optIn = detectsDeepAnalysisOptIn(input.text);
  const deepAnalysisEnabled = optIn ? true : optOut ? false : input.guidanceState.healing.deepAnalysisEnabled;
  const rupture = detectHealingRupture(input.text);
  const scenario = detectHealingScenario(input.text, rupture);
  const realityPressure = detectRealityPressure(input.text);
  const expired = input.guidanceState.healing.expiresAt !== null && new Date(input.guidanceState.healing.expiresAt).getTime() <= input.now.getTime();
  const startsNewSegment = expired || input.guidanceState.healing.status === "inactive";
  const previousDepth = startsNewSegment ? "recognize" : input.guidanceState.healing.depth;
  const depth: HealingDepth = rupture !== "none" ? "recognize" : realityPressure !== "none" ? "bridge" : startsNewSegment ? "recognize" : previousDepth === "recognize" && deepAnalysisEnabled ? "deepen" : previousDepth;
  const inactive = input.riskLevel === "high" || input.riskLevel === "imminent";
  const evidence = primaryEvidence(input.text, scenario);
  const claim = deepAnalysisEnabled && rupture === "none" ? insightFor(scenario) : null;
  return {
    scenario,
    deepAnalysisEnabled,
    brief: {
      schemaVersion: 1,
      status: inactive ? "inactive" : rupture !== "none" ? "repairing" : "active",
      goal: goalFor(scenario, realityPressure, rupture),
      depth,
      insight: claim && evidence.length ? { claim, evidenceSpans: evidence, confidence: scenario === "general" ? 0.55 : 0.72 } : null,
      rupture,
      realityPressure,
      allowedMoves: rupture !== "none"
        ? ["承认刚才具体失配", "重新说清现实重量", "更换回应方式"]
        : ["具体看见", ...(claim ? ["一个可被否认的核心理解"] : []), ...(realityPressure !== "none" ? ["一个低压力现实入口"] : ["留出内在变化空间"])],
      forbiddenMoves: ["换词复述", "空泛陪伴", "强行积极化", "诊断或人格定型", "多个核心解释", "未经授权的行动"],
      replyOutline: rupture !== "none"
        ? ["承认说偏或说轻", "锚定真正的事实和代价", "换一种支持方式"]
        : ["具体事实", claim ? "一个有证据的新理解" : "不越界的具体承接", realityPressure !== "none" ? "低压现实入口" : "一点松动、理解或选择权"],
    },
  };
}

export function inactiveHealingBrief(): HealingBriefV1 {
  return { schemaVersion: 1, status: "inactive", goal: "felt_seen", depth: "recognize", insight: null, rupture: "none", realityPressure: "none", allowedMoves: [], forbiddenMoves: ["心理化普通话题"], replyOutline: ["直接回应用户当前内容"] };
}
