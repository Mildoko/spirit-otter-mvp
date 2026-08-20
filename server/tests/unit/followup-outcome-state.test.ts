import { describe, expect, it } from "vitest";
import { assertFollowupOutcomeTransition, canTransitionFollowupOutcome, lifecycleStatusForOutcome } from "../../src/followups/outcome-state.js";

describe("follow-up five-state outcome machine", () => {
  it("supports progress, blockage and redefinition without treating them as failure", () => {
    expect(canTransitionFollowupOutcome("not_started", "partial_progress")).toBe(true);
    expect(canTransitionFollowupOutcome("partial_progress", "blocked")).toBe(true);
    expect(canTransitionFollowupOutcome("blocked", "redefined")).toBe(true);
    expect(canTransitionFollowupOutcome("redefined", "not_started")).toBe(true);
  });

  it("keeps completed terminal and rejects duplicate labels", () => {
    expect(canTransitionFollowupOutcome("completed", "blocked")).toBe(false);
    expect(() => assertFollowupOutcomeTransition({ from: "completed", to: "blocked", wasPreviouslyLabeled: true })).toThrow(/不能/u);
    expect(() => assertFollowupOutcomeTransition({ from: "blocked", to: "blocked", wasPreviouslyLabeled: true })).toThrow(/没有变化/u);
  });

  it("closes every reported non-completed outcome to avoid repeated pressure", () => {
    expect(lifecycleStatusForOutcome("not_started")).toBe("closed");
    expect(lifecycleStatusForOutcome("partial_progress")).toBe("closed");
    expect(lifecycleStatusForOutcome("blocked")).toBe("closed");
    expect(lifecycleStatusForOutcome("redefined")).toBe("closed");
    expect(lifecycleStatusForOutcome("completed")).toBe("completed");
  });
});
