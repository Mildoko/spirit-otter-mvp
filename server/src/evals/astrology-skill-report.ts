import type { AstrologySkillEvalReport } from "./astrology-skill-eval.js";

const pct = (rate: number | null) => rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`;

export function renderAstrologySkillMarkdown(report: AstrologySkillEvalReport): string {
  const manual = report.multiTurnResults.filter((item) => item.automation === "manual_review");
  const fallbackTraces = [
    ...report.singleTurnResults,
    ...report.multiTurnResults.flatMap((item) => item.trace),
  ].filter((item) => item.fallbackDiagnostics);
  return [
    "# 鹿禅 Astrology Skill Eval v1",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 通道：${report.lane}`,
    `- 自动运行状态：**${report.runStatus}**`,
    `- 人工体验评审：**${report.manualExperienceReview}**`,
    `- Git：${report.run.gitCommit}${report.run.gitDirty ? "（dirty）" : ""}`,
    `- 模型：${report.run.provider} / ${report.run.model}`,
    `- Experience / Prompt / Policy：${report.run.experienceConstitutionVersion} / ${report.run.promptVersion} / ${report.run.policyVersion}`,
    `- Character / Style：${report.run.characterVersion} / ${report.run.responseStyleVersion}`,
    `- Skill / Knowledge / Harness：${report.run.skillVersion} / ${report.run.knowledgeVersion} / ${report.run.harnessVersion}`,
    "",
    "> 安全与现实边界 > 核心体验 > 产品策略 > Skill > Eval。自动 passed 不代表人工体验已经验证。",
    "",
    "## 覆盖",
    "",
    `- 单轮样本：${report.coverage.singleTurnSamples}`,
    `- 多轮脚本：${report.coverage.multiTurnScripts}（人工评审 ${report.coverage.manualReviewScripts}）`,
    `- 复用安全语料：${report.coverage.safetyCorpusCases}`,
    "",
    "## 指标",
    "",
    "| 指标 | 门禁 | 通过 | 总数 | 比例 |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.metrics.map((metric) => `| ${metric.id} | ${metric.gate} | ${metric.numerator} | ${metric.denominator} | ${pct(metric.rate)} |`),
    "",
    "## Failure Bucket",
    "",
    ...(Object.keys(report.summaries.failureBuckets).length ? Object.entries(report.summaries.failureBuckets).map(([bucket, count]) => `- ${bucket}: ${count}`) : ["无"]),
    "",
    "## 硬门禁失败",
    "",
    ...(report.hardGateFailures.length ? report.hardGateFailures.map((item) => `- ${item.checkId} [${item.bucket}] ${item.detail}`) : ["无"]),
    "",
    "## 运行有效性",
    "",
    ...(report.invalidReasons.length ? report.invalidReasons.map((item) => `- ${item}`) : ["运行有效。"]),
    "",
    "## Fallback 诊断",
    "",
    ...(fallbackTraces.length ? fallbackTraces.map((item) => {
      const fallback = item.fallbackDiagnostics!;
      return `- ${item.id}：stage=${fallback.stage}；provider=${fallback.providerReason ?? "none"}；初稿=${fallback.initialViolationCodes.join("、") || "无"}；修复稿=${fallback.repairViolationCodes.join("、") || "无"}`;
    }) : ["无 fallback。"]),
    "",
    "## 待人工盲评",
    "",
    ...manual.flatMap((script) => [
      `### ${script.scriptId} ${script.name}`,
      ...script.trace.map((turn) => `- ${turn.id}\n  - 用户：${turn.input}\n  - 鹿禅：${turn.reply}`),
    ]),
    "",
  ].join("\n");
}
