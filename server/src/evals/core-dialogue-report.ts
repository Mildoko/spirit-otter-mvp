import type { CoreDialogueEvalReport, MetricSummary } from "./core-dialogue-eval.js";

function percentage(rate: number | null): string {
  return rate === null ? "N/A" : `${(rate * 100).toFixed(1)}%`;
}

function metricValue(metric: MetricSummary): string {
  if (metric.rate === null) return "N/A";
  return `${metric.numerator}/${metric.denominator} (${percentage(metric.rate)})`;
}

function delta(metric: MetricSummary): string {
  if (metric.delta === null) return "N/A";
  const prefix = metric.delta > 0 ? "+" : "";
  return `${prefix}${(metric.delta * 100).toFixed(1)}pp`;
}

export function renderCoreDialogueMarkdown(report: CoreDialogueEvalReport): string {
  const failedSingle = report.singleTurnResults.filter((result) => !result.passed);
  const failedScripts = report.multiTurnResults.filter((result) => result.passed === false);
  const manualScripts = report.multiTurnResults.filter((result) => result.automation === "manual_review");
  const lines = [
    "# Core Dialogue Eval v1 报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 运行通道：${report.lane}`,
    `- 运行状态：**${report.runStatus}**`,
    `- 核心体验人工评审：${report.manualExperienceReview}`,
    `- 发布结论：${report.releaseDecision}`,
    `- Git：${report.run.gitCommit}${report.run.gitDirty ? "（工作区有未提交改动）" : ""}`,
    `- Provider / Model：${report.run.provider} / ${report.run.model}`,
    `- Experience Constitution：${report.run.experienceConstitutionVersion}`,
    `- Prompt / Policy：${report.run.promptVersion} / ${report.run.policyVersion}`,
    `- Character / Style：${report.run.characterVersion} / ${report.run.responseStyleVersion}`,
    "",
    "> 优先级固定为：安全与现实边界 > 核心体验 > 产品策略 > Eval 指标。非安全指标不得以破坏核心体验为代价优化。",
    "> 本报告的 passed 只表示自动硬门禁通过，不证明核心体验改善，也不能单独形成发布结论。",
    "",
    "## 覆盖范围",
    "",
    `- 单轮开发校准样本：${report.coverage.singleTurnSamples}`,
    `- 复用冻结安全语料：${report.coverage.safetyCorpusCases}`,
    `- 自动多轮脚本：${report.coverage.multiTurnAutomated}`,
    `- 人工评审多轮脚本：${report.coverage.multiTurnManualReview}`,
    "",
    "## 指标",
    "",
    "| 指标 | 可测性 | 门禁 | 数值 | 基线变化 | 说明 |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...report.metrics.map((metric) => `| ${metric.metricId} ${metric.name} | ${metric.availability} | ${metric.gate} | ${metricValue(metric)} | ${delta(metric)} | ${metric.note} |`),
    "",
    "## 按任务桶",
    "",
    "| 任务桶 | 通过 | 总数 |",
    "| --- | ---: | ---: |",
    ...Object.entries(report.summaries.byTaskType).map(([name, value]) => `| ${name} | ${value.passed} | ${value.total} |`),
    "",
    "## 按风险桶",
    "",
    "| 风险桶 | 通过 | 总数 |",
    "| --- | ---: | ---: |",
    ...Object.entries(report.summaries.byRiskLevel).map(([name, value]) => `| ${name} | ${value.passed} | ${value.total} |`),
    "",
    "## Failure Bucket",
    "",
    "| Bucket | 失败数 |",
    "| --- | ---: |",
    ...Object.entries(report.summaries.failureBuckets).map(([name, count]) => `| ${name} | ${count} |`),
    "",
    "## 硬门禁失败",
    "",
    ...(report.hardGateFailures.length ? report.hardGateFailures.map((failure) => `- ${failure.checkId}：${failure.failureSubtype}；${failure.detail}`) : ["无"]),
    "",
    "## 观察性失败",
    "",
    ...(failedSingle.length || failedScripts.length
      ? [
          ...failedSingle.map((result) => `- ${result.sampleId}：${result.trace.checks.filter((item) => !item.passed).map((item) => item.failureSubtype).join("、")}`),
          ...failedScripts.map((result) => `- ${result.scriptId}：${result.trace.flatMap((turn) => turn.checks).filter((item) => !item.passed).map((item) => item.failureSubtype).join("、")}`),
        ]
      : ["无"]),
    "",
    "## 待人工评审脚本",
    "",
    ...manualScripts.map((script) => `- ${script.scriptId} ${script.scriptName}：trace 已保存，第一阶段不计算回访状态或完整低负担指标。`),
    "",
    "## 运行有效性",
    "",
    ...(report.invalidReasons.length ? report.invalidReasons.map((reason) => `- ${reason}`) : ["运行有效。"]),
    "",
  ];
  return lines.join("\n");
}
