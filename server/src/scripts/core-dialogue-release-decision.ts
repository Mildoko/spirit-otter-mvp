import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decideCoreDialogueRelease, renderReleaseDecisionMarkdown, type ManualExperienceReviewResult } from "../release/release-decision.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const value = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? process.env[`npm_config_${name.replaceAll("-", "_")}`];
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const evalReport = read(value("eval") ?? "test-results/core-dialogue-eval-deterministic.json");
const eventAudit = read(value("events") ?? "test-results/core-dialogue-event-audit.json");
const productMetrics = read(value("metrics") ?? "test-results/core-dialogue-product-metrics.json");
const manualPath = value("manual") ?? "test-results/core-experience-review-result.json";
const manualReview = existsSync(resolve(root, manualPath)) ? read(manualPath) as ManualExperienceReviewResult : undefined;
const report = decideCoreDialogueRelease({
  evalStatus: evalReport.runStatus,
  eventAuditStatus: eventAudit.status,
  productMetricsStatus: productMetrics.status,
  ...(manualReview ? { manualReview } : {}),
  candidateDeployed: process.argv.includes("--candidate-deployed") || process.env.npm_config_candidate_deployed === "true",
});
const outputDirectory = resolve(root, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "core-dialogue-release-decision.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(resolve(outputDirectory, "core-dialogue-release-decision.md"), renderReleaseDecisionMarkdown(report), "utf8");
process.stdout.write(`CORE_DIALOGUE_RELEASE_DECISION ${report.decision}\n`);
if (report.decision === "hold" || report.decision === "rollback") process.exitCode = 1;
