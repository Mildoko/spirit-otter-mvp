import { describe, expect, it } from "vitest";
import type { ResponsePlan } from "@otter/shared";
import { buildVisualCue } from "../../src/modules/support/visual-cue.js";

const plan: ResponsePlan = {
  activeSpirit: "deep_tide",
  transitionStyle: "steady",
  supportMode: "validate",
  sceneState: "underwater_companion",
  primaryStrategy: "specific_reflection",
  allowActionDraft: false,
  routeReasonCodes: [],
  lockTurnsRemaining: 0,
  allowedContent: [],
  forbiddenContent: [],
};

describe("visual cue", () => {
  it.each(["elevated", "high", "imminent"] as const)("keeps %s risk visually still", (riskLevel) => {
    expect(buildVisualCue({ riskLevel, plan, hasActionDraft: true })).toMatchObject({
      action: "safety_still",
      ripple: "none",
      glow: "dim",
    });
  });

  it("uses invite only for low-risk mobilization", () => {
    expect(buildVisualCue({ riskLevel: "low", plan: { ...plan, supportMode: "mobilize" }, hasActionDraft: false }).action).toBe("invite");
    expect(buildVisualCue({ riskLevel: "low", plan, hasActionDraft: false }).action).toBe("speak");
  });
});
