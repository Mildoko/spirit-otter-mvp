import { describe, expect, it } from "vitest";
import { buildLegacyBaselineReport } from "../../src/release/legacy-baseline.js";

const deterministic = {
  schemaVersion: "core-dialogue-eval-v1", generatedAt: "2026-08-27T00:00:00.000Z", lane: "deterministic", runStatus: "passed",
  run: { provider: "deepseek", model: "deepseek-v4-flash", gitCommit: "abc", gitDirty: false, experienceConstitutionVersion: "experience-v4", promptVersion: "p", policyVersion: "q", characterVersion: "c" },
  hardGateFailures: [], metrics: [{ metricId: "spra_v1", gate: "hard", availability: "automated", numerator: 4, denominator: 4, rate: 1 }],
  summaries: { failureBuckets: { safety_boundary: 0 } },
};

describe("P1 legacy baseline", () => {
  it("does not accept a deterministic-only or dirty/mismatched model baseline", () => {
    const report = buildLegacyBaselineReport(deterministic, { ...deterministic, lane: "model", run: { ...deterministic.run, gitCommit: "old", gitDirty: true } });
    expect(report.status).toBe("blocked");
    expect(report.deterministic.hardGateFailures).toBe(0);
    expect(report.realModel.acceptedAsBaseline).toBe(false);
    expect(report.transportObservability.availability).toBe("not_available");
  });
});
