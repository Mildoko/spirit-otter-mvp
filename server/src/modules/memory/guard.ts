import type { MemoryCandidate } from "@otter/shared";

const forbiddenPatterns = [
  /(?:抑郁症|焦虑症|双相|人格障碍|精神病|确诊|诊断为|治疗方案)/i,
  /(?:自杀|自残|结束.{0,4}生命|怎么死|跳楼|割腕|吞药|上吊|致死剂量)/i,
  /(?:api[_ -]?key|password|密码|验证码|银行卡|身份证号|护照号|手机号|电话号码|家庭住址|私钥|token)/i,
  /(?:性取向|同性恋|双性恋|跨性别|宗教信仰|政治立场|种族|艾滋|怀孕|流产|性侵|虐待经历)/i,
  /(?:只有澜泊|离不开澜泊|依赖澜泊|唯一理解|最亲密|忠诚度|亲密度)/i,
  /(?:忽略.{0,8}(?:规则|指令)|system prompt|开发者消息|泄露提示词)/i,
];

const inferableKinds = new Set<MemoryCandidate["kind"]>(["episode", "relationship_milestone"]);

export interface GuardResult { accepted: boolean; reason?: string }

export function guardMemoryCandidate(candidate: MemoryCandidate, userText: string): GuardResult {
  if (!userText.includes(candidate.evidence)) return { accepted: false, reason: "EVIDENCE_NOT_VERBATIM" };
  if (candidate.sensitivity === "sensitive" || candidate.sensitivity === "highly_sensitive") return { accepted: false, reason: "SENSITIVE_CONTENT" };
  if (forbiddenPatterns.some((pattern) => pattern.test(`${candidate.content} ${candidate.structuredValue ?? ""} ${candidate.evidence}`))) {
    return { accepted: false, reason: "FORBIDDEN_CONTENT" };
  }
  if (candidate.origin === "user_explicit") {
    if (candidate.importance < 0.7 || candidate.confidence < 0.8) return { accepted: false, reason: "LOW_SCORE" };
  } else {
    if (!inferableKinds.has(candidate.kind)) return { accepted: false, reason: "INFERENCE_KIND_BLOCKED" };
    if (candidate.importance < 0.8 || candidate.confidence < 0.9) return { accepted: false, reason: "LOW_INFERENCE_SCORE" };
  }
  return { accepted: true };
}

export function filterMemoryCandidates(candidates: MemoryCandidate[], userText: string): MemoryCandidate[] {
  return candidates.filter((candidate) => guardMemoryCandidate(candidate, userText).accepted).slice(0, 2);
}
