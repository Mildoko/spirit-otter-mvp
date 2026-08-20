import { describe, expect, it } from "vitest";
import { decideCoreDialogueRelease } from "../../src/release/release-decision.js";

describe("core dialogue release decision", () => {
  it("holds when manual experience review is missing", () => {
    const report = decideCoreDialogueRelease({ evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid" });
    expect(report.decision).toBe("hold");
    expect(report.automatedRelease).toBe(false);
  });

  it("rolls back a deployed candidate on experience regression", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid", candidateDeployed: true,
      manualReview: { schemaVersion: "core-experience-review-result-v1", status: "regressed", releaseRecommendation: "rollback", reviewerCount: 2, evaluatedCases: 20, redFlags: ["重复邀请"] },
    });
    expect(report.decision).toBe("rollback");
  });

  it("only releases when accepted human evidence explicitly recommends release", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      manualReview: { schemaVersion: "core-experience-review-result-v1", status: "accepted", releaseRecommendation: "release", reviewerCount: 2, evaluatedCases: 20, redFlags: [] },
    });
    expect(report.decision).toBe("release");
    expect(report.automatedRelease).toBe(false);
  });
});
