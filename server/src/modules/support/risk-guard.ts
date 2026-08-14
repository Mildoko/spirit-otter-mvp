import type { RiskLevel } from "@otter/shared";

export interface HardRiskResult {
  level: RiskLevel;
  ruleCodes: string[];
}

const imminentPatterns = [
  /(?:现在|马上|今晚|立刻).{0,12}(?:自杀|结束生命|不想活)/u,
  /(?:已经|正在).{0,10}(?:割腕|吞药|跳楼|上吊)/u,
  /(?:刀|药|绳|楼顶).{0,16}(?:准备好了|就在旁边|已经拿到)/u,
  /(?:已经|正在).{0,12}(?:刀|药|绳).{0,16}(?:伤害自己|自残|自杀)/u,
  /(?:楼顶|桥边).{0,16}(?:马上|现在).{0,8}(?:跳下去|跳楼)/u,
  /我要.{0,8}(?:杀了|伤害).{0,8}(?:他|她|他们|别人)/u,
];

const highPatterns = [
  /(?:想|打算|计划).{0,12}(?:自杀|死掉|结束生命|不活了)/u,
  /(?:自残|割腕|吞药|跳楼|上吊)/u,
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
