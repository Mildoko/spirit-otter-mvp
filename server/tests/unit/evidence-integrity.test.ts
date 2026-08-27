import { describe, expect, it } from "vitest";
import { assessEvidenceIntegrity, type EvidenceProvenanceV1 } from "../../src/release/evidence-integrity.js";

const current: EvidenceProvenanceV1 = {
  schemaVersion: "release-evidence-provenance-v1",
  generatedAt: "2026-08-27T00:00:00.000Z",
  gitCommit: "current-sha",
  gitDirty: false,
};

describe("release evidence integrity", () => {
  it("passes only clean evidence from the current commit", () => {
    const result = assessEvidenceIntegrity({
      current,
      artifacts: [{ artifactId: "eval", required: true, gitCommit: "current-sha", gitDirty: false }],
    });
    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
  });

  it("fails missing, stale, dirty, and dirty-worktree evidence", () => {
    const result = assessEvidenceIntegrity({
      current: { ...current, gitDirty: true },
      artifacts: [
        { artifactId: "events", required: true },
        { artifactId: "metrics", required: true, gitCommit: "old-sha", gitDirty: false },
        { artifactId: "eval", required: true, gitCommit: "current-sha", gitDirty: true },
      ],
    });
    expect(result.status).toBe("failed");
    expect(result.reasons).toHaveLength(4);
  });

  it("does not fail an optional artifact that is not present", () => {
    const result = assessEvidenceIntegrity({
      current,
      artifacts: [{ artifactId: "manual-review", required: false }],
    });
    expect(result.status).toBe("passed");
  });
});
