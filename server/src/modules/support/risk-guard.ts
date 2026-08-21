import type { RiskLevel } from "@otter/shared";

export interface HardRiskResult {
  level: RiskLevel;
  ruleCodes: string[];
}

const imminentPatterns = [
  /(?:现在|马上|今晚|立刻).{0,12}(?:自杀|结束生命|不想活)/u,
  /不想活.{0,12}(?:现在|马上|今晚|立刻).{0,12}(?:结束|去死|做掉)/u,
  /(?:已经|正在).{0,10}(?:割腕|吞药|跳楼|上吊)/u,
  /(?:已经|刚刚|刚才|正在).{0,10}(?:吃下|服下|吞下).{0,8}(?:药|药片|药物)/u,
  /(?:刀|药|绳|楼顶).{0,16}(?:准备好了|就在旁边|已经拿到)/u,
  /(?:已经|正在).{0,12}(?:刀|药|绳).{0,16}(?:伤害自己|自残|自杀)/u,
  /(?:楼顶|桥边).{0,16}(?:马上|现在).{0,8}(?:跳下去|跳楼)/u,
  /(?:马上|现在|立刻).{0,16}(?:楼顶|桥边).{0,8}(?:跳下去|跳楼)/u,
  /我要.{0,8}(?:杀了|伤害).{0,8}(?:他|她|他们|别人)/u,
];

const highPatterns = [
  /(?:不想活了|活不下去)/u,
  /(?:想|打算|计划|准备).{0,12}(?:自杀|死掉|结束.{0,4}生命|不活了)/u,
  /(?:自残|割腕|吞药|跳楼|上吊)/u,
  /(?:吃下|服下|吞下).{0,8}(?:大量|很多|过量).{0,4}(?:药|药片|药物)/u,
  /活着.{0,8}(?:没意义|没有意义)/u,
  /(?:杀人|伤害别人|弄死他)/u,
  /(?:要|想|准备).{0,10}(?:杀了|伤害).{0,8}(?:他|她|他们|别人)/u,
  /(?:要|想|准备|打算).{0,10}(?:伤害自己|自残)/u,
];

const elevatedPatterns = [
  /(?:撑不住|受不了了|绝望|走投无路)/u,
  /(?:有人监视我|他们都在害我|声音命令我)/u,
  /(?:停药|加药|减药).{0,12}(?:可以吗|怎么办)/u,
  /(?:只有你|别离开我|没有你我不行)/u,
];

export function runHardRiskGuard(text: string): HardRiskResult {
  const normalized = text.trim();
  const imminent = imminentPatterns.findIndex((pattern) => pattern.test(normalized));
  if (imminent >= 0) return { level: "imminent", ruleCodes: [`IMMINENT_${imminent + 1}`] };

  const high = highPatterns.findIndex((pattern) => pattern.test(normalized));
  if (high >= 0) return { level: "high", ruleCodes: [`HIGH_${high + 1}`] };

  const elevated = elevatedPatterns.findIndex((pattern) => pattern.test(normalized));
  if (elevated >= 0) return { level: "elevated", ruleCodes: [`ELEVATED_${elevated + 1}`] };

  return { level: "low", ruleCodes: [] };
}

export function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const ranks: Record<RiskLevel, number> = { low: 0, elevated: 1, high: 2, imminent: 3 };
  return ranks[left] >= ranks[right] ? left : right;
}

export function resolveRiskLevel(
  hardRisk: RiskLevel,
  modelHint: RiskLevel,
  evidence?: { urgencyScore: number; helplessnessScore: number },
): RiskLevel {
  if (hardRisk === "high" || hardRisk === "imminent") return hardRisk;
  if (hardRisk === "low" && modelHint !== "low") {
    const supportsElevation = Boolean(evidence && (evidence.urgencyScore >= 0.65 || evidence.helplessnessScore >= 0.75));
    if (!supportsElevation) return "low";
  }
  const boundedModelHint = modelHint === "high" || modelHint === "imminent" ? "elevated" : modelHint;
  return maxRisk(hardRisk, boundedModelHint);
}
