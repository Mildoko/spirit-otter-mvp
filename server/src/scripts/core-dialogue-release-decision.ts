import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decideCoreDialogueRelease, renderReleaseDecisionMarkdown, type ManualExperienceReviewResult } from "../release/release-decision.js";
import { assessEvidenceIntegrity, resolveEvidenceProvenance, type EvidenceProvenanceV1 } from "../release/evidence-integrity.js";
import { loadEnv } from "../config/env.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const value = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? process.env[`npm_config_${name.replaceAll("-", "_")}`];
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, any>;
const readOptional = (path: string) => existsSync(resolve(root, path)) ? read(path) : undefined;
const evalReport = readOptional(value("eval") ?? "test-results/core-dialogue-eval-deterministic.json");
const eventAudit = readOptional(value("events") ?? "test-results/core-dialogue-event-audit.json");
const productMetrics = readOptional(value("metrics") ?? "test-results/core-dialogue-product-metrics.json");
const manualPath = value("manual") ?? "test-results/core-experience-review-result.json";
const manualReview = existsSync(resolve(root, manualPath)) ? read(manualPath) as ManualExperienceReviewResult : undefined;
const feedbackGatePath = value("feedback-gate") ?? "test-results/voluntary-feedback-gate.json";
const voluntaryFeedbackGate = existsSync(resolve(root, feedbackGatePath)) ? read(feedbackGatePath) as {
  schemaVersion: "voluntary-feedback-gate-v1";
  status: "passed" | "pending" | "blocked" | "invalid";
  completedSegments: number;
} : undefined;
const env = loadEnv();
const structuredOutput = readOptional(value("structured") ?? "test-results/structured-output-ab.json");
const stateParity = readOptional(value("state-parity") ?? "test-results/state-parity.json");
const promptRegression = readOptional(value("prompt-regression") ?? "test-results/prompt-regression.json");
const p1Modes = {
  structuredOutput: env.LLM_STRUCTURED_OUTPUT_MODE,
  guidance: env.GUIDANCE_ENGINE_MODE,
  action: env.ACTION_ENGINE_MODE,
  followup: env.FOLLOWUP_ENGINE_MODE,
};
const requiresStructured = p1Modes.structuredOutput === "new";
const requiresState = [p1Modes.guidance, p1Modes.action, p1Modes.followup].includes("new");
const requiresPromptRegression = Object.values(p1Modes).includes("new");
const current = resolveEvidenceProvenance(root);
const provenanceOf = (report: Record<string, any> | undefined): EvidenceProvenanceV1 | undefined => report?.provenance as EvidenceProvenanceV1 | undefined;
const evidenceIntegrity = assessEvidenceIntegrity({
  current,
  artifacts: [
    { artifactId: "core-dialogue-eval", required: true, gitCommit: evalReport?.run?.gitCommit, gitDirty: evalReport?.run?.gitDirty },
    { artifactId: "core-dialogue-event-audit", required: true, gitCommit: provenanceOf(eventAudit)?.gitCommit, gitDirty: provenanceOf(eventAudit)?.gitDirty },
    { artifactId: "core-dialogue-product-metrics", required: true, gitCommit: provenanceOf(productMetrics)?.gitCommit, gitDirty: provenanceOf(productMetrics)?.gitDirty },
    { artifactId: "voluntary-feedback-gate", required: Boolean(voluntaryFeedbackGate), gitCommit: provenanceOf(voluntaryFeedbackGate)?.gitCommit, gitDirty: provenanceOf(voluntaryFeedbackGate)?.gitDirty },
    { artifactId: "core-experience-review", required: Boolean(manualReview), gitCommit: manualReview?.candidateCommit, gitDirty: false },
    ...(requiresStructured ? [{ artifactId: "structured-output-ab", required: true, gitCommit: provenanceOf(structuredOutput)?.gitCommit, gitDirty: provenanceOf(structuredOutput)?.gitDirty }] : []),
    ...(requiresState ? [{ artifactId: "state-parity", required: true, gitCommit: provenanceOf(stateParity)?.gitCommit, gitDirty: provenanceOf(stateParity)?.gitDirty }] : []),
    ...(requiresPromptRegression ? [{ artifactId: "prompt-regression", required: true, gitCommit: provenanceOf(promptRegression)?.gitCommit, gitDirty: provenanceOf(promptRegression)?.gitDirty }] : []),
  ],
});
const report = decideCoreDialogueRelease({
  evalStatus: evalReport?.runStatus === "passed" || evalReport?.runStatus === "failed" ? evalReport.runStatus : "invalid",
  eventAuditStatus: eventAudit?.status === "passed" ? "passed" : "failed",
  productMetricsStatus: productMetrics?.status === "valid" ? "valid" : "invalid",
  evidenceIntegrity,
  ...(manualReview ? { manualReview } : {}),
  ...(voluntaryFeedbackGate ? { voluntaryFeedbackGate } : {}),
  candidateDeployed: process.argv.includes("--candidate-deployed") || process.env.npm_config_candidate_deployed === "true",
  p1: {
    modes: p1Modes,
    structuredOutputStatus: structuredOutput?.status === "passed" ? "passed" : structuredOutput ? (structuredOutput.status ?? "failed") : "missing",
    stateParityStatus: stateParity?.status === "passed" ? "passed" : stateParity ? (stateParity.status ?? "failed") : "missing",
    promptRegressionStatus: promptRegression?.status === "passed" ? "passed" : promptRegression ? (promptRegression.status ?? "failed") : "missing",
  },
});
const outputDirectory = resolve(root, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "core-dialogue-release-decision.json"), JSON.stringify(report, null, 2), "utf8");
writeFileSync(resolve(outputDirectory, "core-dialogue-release-decision.md"), renderReleaseDecisionMarkdown(report), "utf8");
process.stdout.write(`CORE_DIALOGUE_RELEASE_DECISION ${report.decision}\n`);
if (report.decision === "hold" || report.decision === "rollback") process.exitCode = 1;
