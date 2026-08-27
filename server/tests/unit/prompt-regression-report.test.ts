import { describe, expect, it } from "vitest";
import { buildPromptRegressionReport } from "../../src/prompt-regression/report.js";

const provenance = { schemaVersion: "release-evidence-provenance-v1" as const, generatedAt: "2026-08-27T00:00:00.000Z", gitCommit: "abc", gitDirty: false };
const raw = { results: { results: [{ success: true, vars: { sampleId: "S1", riskRequired: false }, metadata: { riskCoverage: "pending_model" }, response: { output: JSON.stringify({ promptVersion: "p", policyVersion: "v", characterVersion: "c", gitCommit: "abc", gitDirty: false }) } }] } };

describe("prompt-regression-v1 summary", () => {
  it("keeps offline-only evidence blocked and strips prompts and replies", () => {
    const report = buildPromptRegressionReport({ provenance, model: "deepseek-v4-flash", offlineRaw: raw });
    expect(report.status).toBe("blocked");
    expect(report.offline).toMatchObject({ status: "passed", samples: 1, pendingModelRiskChecks: 1, provenanceValid: true });
    expect(report.realModel.status).toBe("blocked");
    expect(JSON.stringify(report)).not.toContain("reply");
  });

  it("rejects stale or dirty raw Promptfoo results", () => {
    const stale = structuredClone(raw);
    stale.results.results[0]!.response.output = JSON.stringify({ promptVersion: "p", policyVersion: "v", characterVersion: "c", gitCommit: "old", gitDirty: false });
    const report = buildPromptRegressionReport({ provenance, model: "deepseek-v4-flash", offlineRaw: stale });
    expect(report.offline).toMatchObject({ status: "stale", provenanceValid: false });
    expect(report.status).toBe("blocked");
  });
});
