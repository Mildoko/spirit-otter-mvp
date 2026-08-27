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
      manualReview: { schemaVersion: "core-experience-review-result-v2", status: "regressed", releaseRecommendation: "rollback", reviewerCount: 3, reviewerIds: ["r1", "r2", "r3"], blindingAttested: true, evaluatedCases: 20, redFlags: ["重复邀请"] },
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "passed", completedSegments: 50 },
    });
    expect(report.decision).toBe("rollback");
  });

  it("only releases when accepted human evidence explicitly recommends release", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      manualReview: { schemaVersion: "core-experience-review-result-v2", status: "accepted", releaseRecommendation: "release", reviewerCount: 3, reviewerIds: ["r1", "r2", "r3"], blindingAttested: true, evaluatedCases: 20, redFlags: [] },
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "passed", completedSegments: 50 },
    });
    expect(report.decision).toBe("release");
    expect(report.automatedRelease).toBe(false);
  });

  it("holds an otherwise accepted candidate until the voluntary feedback gate passes", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      manualReview: { schemaVersion: "core-experience-review-result-v2", status: "accepted", releaseRecommendation: "release", reviewerCount: 3, reviewerIds: ["r1", "r2", "r3"], blindingAttested: true, evaluatedCases: 20, redFlags: [] },
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "pending", completedSegments: 49 },
    });
    expect(report.decision).toBe("hold");
  });
});
