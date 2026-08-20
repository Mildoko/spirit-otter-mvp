import { createHash } from "node:crypto";

interface EvalTrace { user: string; reply: string }
interface EvalArtifact {
  schemaVersion: string;
  run: { gitCommit: string; experienceConstitutionVersion: string };
  singleTurnResults: Array<{ sampleId: string; trace: EvalTrace }>;
}

export interface BlindReviewEntry {
  caseId: string;
  user: string;
  responseA: string;
  responseB: string;
  dimensions: readonly ["concrete_support", "user_pacing", "character_continuity", "low_pressure", "overall_preference"];
}

export interface BlindReviewPacket {
  schemaVersion: "core-experience-blind-review-v1";
  experienceConstitutionVersion: string;
  generatedAt: string;
  entries: BlindReviewEntry[];
  instructions: string[];
}

export interface BlindReviewAnswerKey {
  schemaVersion: "core-experience-blind-review-key-v1";
  baselineCommit: string;
  candidateCommit: string;
  assignments: Array<{ caseId: string; responseA: "baseline" | "candidate"; responseB: "baseline" | "candidate" }>;
}

export function createCoreExperienceBlindReview(input: {
  baseline: EvalArtifact;
  candidate: EvalArtifact;
  seed: string;
  now?: Date;
}): { packet: BlindReviewPacket; answerKey: BlindReviewAnswerKey } {
  if (input.baseline.schemaVersion !== "core-dialogue-eval-v1" || input.candidate.schemaVersion !== "core-dialogue-eval-v1") {
    throw new Error("盲评输入必须是 Core Dialogue Eval v1 报告");
  }
  if (input.baseline.run.experienceConstitutionVersion !== input.candidate.run.experienceConstitutionVersion) {
    throw new Error("基线与候选使用不同体验宪法版本，不能直接盲评");
  }
  const baseline = new Map(input.baseline.singleTurnResults.map((item) => [item.sampleId, item.trace]));
  const candidate = new Map(input.candidate.singleTurnResults.map((item) => [item.sampleId, item.trace]));
  if (baseline.size !== candidate.size || [...baseline.keys()].some((id) => !candidate.has(id))) throw new Error("基线与候选样本集合不一致");
  const assignments: BlindReviewAnswerKey["assignments"] = [];
  const entries = [...baseline.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([caseId, base]) => {
    const next = candidate.get(caseId)!;
    const candidateIsA = createHash("sha256").update(`${input.seed}:${caseId}`).digest()[0]! % 2 === 0;
    assignments.push({ caseId, responseA: candidateIsA ? "candidate" : "baseline", responseB: candidateIsA ? "baseline" : "candidate" });
    return {
      caseId,
      user: base.user,
      responseA: candidateIsA ? next.reply : base.reply,
      responseB: candidateIsA ? base.reply : next.reply,
      dimensions: ["concrete_support", "user_pacing", "character_continuity", "low_pressure", "overall_preference"] as const,
    };
  });
  return {
    packet: {
      schemaVersion: "core-experience-blind-review-v1",
      experienceConstitutionVersion: input.baseline.run.experienceConstitutionVersion,
      generatedAt: (input.now ?? new Date()).toISOString(),
      entries,
      instructions: [
        "评审前不得查看 Eval 分数或答案键。",
        "逐案例独立选择 A 更好、无明显差异、B 更好，并记录体验红旗。",
        "至少两名评审者完成后再揭盲；分歧不能用自动分数裁决。",
      ],
    },
    answerKey: {
      schemaVersion: "core-experience-blind-review-key-v1",
      baselineCommit: input.baseline.run.gitCommit,
      candidateCommit: input.candidate.run.gitCommit,
      assignments,
    },
  };
}

export function renderBlindReviewMarkdown(packet: BlindReviewPacket): string {
  return [
    "# Core Experience Blind Review v1",
    "",
    `- 体验宪法：${packet.experienceConstitutionVersion}`,
    `- 案例数：${packet.entries.length}`,
    "",
    ...packet.instructions.map((item) => `- ${item}`),
    "",
    ...packet.entries.flatMap((entry) => [
      `## ${entry.caseId}`,
      "",
      `用户：${entry.user}`,
      "",
      `A：${entry.responseA}`,
      "",
      `B：${entry.responseB}`,
      "",
      "- 具体承接：A / 相同 / B",
      "- 用户节奏：A / 相同 / B",
      "- 角色连续性：A / 相同 / B",
      "- 低压力：A / 相同 / B",
      "- 总体偏好：A / 相同 / B",
      "- 红旗与证据：",
      "",
    ]),
  ].join("\n");
}
