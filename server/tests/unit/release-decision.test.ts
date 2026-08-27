import { describe, expect, it } from "vitest";
import { decideCoreDialogueRelease } from "../../src/release/release-decision.js";

const evidenceIntegrity = {
  status: "passed" as const,
  currentGitCommit: "candidate-sha",
  currentGitDirty: false,
  reasons: [],
};

const acceptedReview = {
  schemaVersion: "core-experience-review-result-v2" as const,
  status: "accepted" as const,
  releaseRecommendation: "release" as const,
  reviewerCount: 3,
  reviewerIds: ["r1", "r2", "r3"],
  blindingAttested: true,
  evaluatedCases: 20,
  redFlags: [],
  candidateCommit: "candidate-sha",
};

describe("core dialogue release decision", () => {
  it("holds when manual experience review is missing", () => {
    const report = decideCoreDialogueRelease({ evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid", evidenceIntegrity });
    expect(report.decision).toBe("hold");
    expect(report.automatedRelease).toBe(false);
  });

  it("rolls back a deployed candidate on experience regression", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid", candidateDeployed: true,
      evidenceIntegrity,
      manualReview: { ...acceptedReview, status: "regressed", releaseRecommendation: "rollback", redFlags: ["重复邀请"] },
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "passed", completedSegments: 50 },
    });
    expect(report.decision).toBe("rollback");
  });

  it("only releases when accepted human evidence explicitly recommends release", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      evidenceIntegrity,
      manualReview: acceptedReview,
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "passed", completedSegments: 50 },
    });
    expect(report.decision).toBe("release");
    expect(report.automatedRelease).toBe(false);
  });

  it("holds an otherwise accepted candidate until the voluntary feedback gate passes", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      evidenceIntegrity,
      manualReview: acceptedReview,
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "pending", completedSegments: 49 },
    });
    expect(report.decision).toBe("hold");
  });

  it("holds when evidence was generated from another commit", () => {
    const report = decideCoreDialogueRelease({
      evalStatus: "passed", eventAuditStatus: "passed", productMetricsStatus: "valid",
      evidenceIntegrity: { ...evidenceIntegrity, status: "failed", reasons: ["core-dialogue-eval 来自 old-sha"] },
      manualReview: acceptedReview,
      voluntaryFeedbackGate: { schemaVersion: "voluntary-feedback-gate-v1", status: "passed", completedSegments: 50 },
    });
    expect(report.decision).toBe("hold");
    expect(report.reasons).toContain("证据完整性：core-dialogue-eval 来自 old-sha");
  });
});
