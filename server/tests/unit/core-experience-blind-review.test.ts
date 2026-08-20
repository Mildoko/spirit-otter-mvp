import { describe, expect, it } from "vitest";
import { createCoreExperienceBlindReview } from "../../src/reviews/core-experience-blind-review.js";

const artifact = (commit: string, reply: string) => ({
  schemaVersion: "core-dialogue-eval-v1",
  run: { gitCommit: commit, experienceConstitutionVersion: "experience-v1" },
  singleTurnResults: [{ sampleId: "SO-V01-001", trace: { user: "我很累", reply } }],
});

describe("core experience blind review", () => {
  it("creates a deterministic blind packet and separate answer key", () => {
    const first = createCoreExperienceBlindReview({ baseline: artifact("base", "基线"), candidate: artifact("next", "候选"), seed: "fixed" });
    const second = createCoreExperienceBlindReview({ baseline: artifact("base", "基线"), candidate: artifact("next", "候选"), seed: "fixed" });
    expect(first.packet.entries).toEqual(second.packet.entries);
    expect(JSON.stringify(first.packet)).not.toContain("baselineCommit");
    expect(first.answerKey.baselineCommit).toBe("base");
  });
});
