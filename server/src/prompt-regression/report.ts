import type { EvidenceProvenanceV1 } from "../release/evidence-integrity.js";

interface PromptfooResult {
  success?: boolean;
  gradingResult?: { reason?: string };
  vars?: { sampleId?: string; riskRequired?: boolean };
  metadata?: { riskCoverage?: string };
  response?: { output?: string };
}

export interface PromptRegressionReport {
  schemaVersion: "prompt-regression-v1";
  provenance: EvidenceProvenanceV1;
  status: "passed" | "failed" | "blocked";
  model: string;
  versions: { prompt: string; policy: string; character: string };
  offline: { status: "passed" | "failed" | "missing" | "stale"; samples: number; hardFailures: Array<{ sampleId: string; reason: string }>; pendingModelRiskChecks: number; provenanceValid: boolean };
  realModel: { status: "passed" | "failed" | "blocked" | "stale"; samples: number; hardFailures: Array<{ sampleId: string; reason: string }>; provenanceValid: boolean };
  privacy: { containsUserContent: false; syntheticOrFrozenOnly: true; sharingDisabled: true; remoteGenerationDisabled: true };
}

function rows(raw: unknown): PromptfooResult[] {
  const value = raw as { results?: { results?: PromptfooResult[] } } | undefined;
  return Array.isArray(value?.results?.results) ? value.results.results : [];
}

function failures(items: PromptfooResult[]): Array<{ sampleId: string; reason: string }> {
  return items.filter((item) => item.success !== true).map((item) => ({
    sampleId: item.vars?.sampleId ?? "unknown",
    reason: item.gradingResult?.reason ?? "promptfoo failure",
  }));
}

function versions(items: PromptfooResult[]): PromptRegressionReport["versions"] {
  for (const item of items) {
    try {
      const output = JSON.parse(item.response?.output ?? "") as { promptVersion?: string; policyVersion?: string; characterVersion?: string };
      if (output.promptVersion && output.policyVersion && output.characterVersion) return { prompt: output.promptVersion, policy: output.policyVersion, character: output.characterVersion };
    } catch { /* Raw output is intentionally discarded from the summary. */ }
  }
  return { prompt: "unknown", policy: "unknown", character: "unknown" };
}

function matchesProvenance(item: PromptfooResult, provenance: EvidenceProvenanceV1): boolean {
  try {
    const output = JSON.parse(item.response?.output ?? "") as { gitCommit?: string; gitDirty?: boolean };
    return output.gitCommit === provenance.gitCommit && output.gitDirty === false;
  } catch {
    return false;
  }
}

export function buildPromptRegressionReport(input: {
  provenance: EvidenceProvenanceV1;
  model: string;
  offlineRaw?: unknown;
  modelRaw?: unknown;
}): PromptRegressionReport {
  const offlineRows = rows(input.offlineRaw);
  const modelRows = rows(input.modelRaw);
  const offlineProvenanceValid = offlineRows.length > 0 && offlineRows.every((item) => matchesProvenance(item, input.provenance));
  const modelProvenanceValid = modelRows.length > 0 && modelRows.every((item) => matchesProvenance(item, input.provenance));
  const offlineFailures = failures(offlineRows);
  const modelFailures = failures(modelRows);
  const offlineStatus = offlineRows.length === 0 ? "missing" : !offlineProvenanceValid ? "stale" : offlineFailures.length === 0 ? "passed" : "failed";
  const modelStatus = modelRows.length === 0 ? "blocked" : !modelProvenanceValid ? "stale" : modelFailures.length === 0 ? "passed" : "failed";
  const status = offlineStatus === "failed" || modelStatus === "failed" ? "failed" : offlineStatus === "passed" && modelStatus === "passed" ? "passed" : "blocked";
  return {
    schemaVersion: "prompt-regression-v1",
    provenance: input.provenance,
    status,
    model: input.model,
    versions: versions(modelRows.length ? modelRows : offlineRows),
    offline: {
      status: offlineStatus,
      samples: offlineRows.length,
      hardFailures: offlineFailures,
      pendingModelRiskChecks: offlineRows.filter((item) => item.metadata?.riskCoverage === "pending_model" || item.vars?.riskRequired === false).length,
      provenanceValid: offlineProvenanceValid,
    },
    realModel: { status: modelStatus, samples: modelRows.length, hardFailures: modelFailures, provenanceValid: modelProvenanceValid },
    privacy: { containsUserContent: false, syntheticOrFrozenOnly: true, sharingDisabled: true, remoteGenerationDisabled: true },
  };
}
