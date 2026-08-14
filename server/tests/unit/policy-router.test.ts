import { describe, expect, it } from "vitest";
import { chooseResponsePlan } from "../../src/modules/support/policy-router.js";
import type { EmotionState } from "@otter/shared";

const calm: EmotionState = {
  valence: -0.2, arousal: 0.3, stressLoad: 0.65, cognitiveOverload: 0.5,
  supportNeed: 0.6, confidence: 0.8, evidenceSpans: [], validUntil: new Date(Date.now() + 1000).toISOString(),
};

describe("deterministic policy router", () => {
  it("blocks organization and metaphors for acute risk", () => {
    const plan = chooseResponsePlan({ currentMode: "organize", intent: "organize", riskLevel: "high", state: calm, transitionAccepted: true });
    expect(plan.sceneState).toBe("safety_plain");
    expect(plan.allowActionDraft).toBe(false);
    expect(plan.allowModeInvitation).toBe(false);
    expect(plan.forbiddenContent).toContain("水域隐喻");
  });

  it("requires an accepted transition before drafting an action", () => {
    const companion = chooseResponsePlan({ currentMode: "companion", intent: "auto", riskLevel: "low", state: calm, transitionAccepted: false });
    expect(companion.allowModeInvitation).toBe(false);
    expect(companion.allowActionDraft).toBe(false);
    const requested = chooseResponsePlan({ currentMode: "companion", intent: "organize", riskLevel: "low", state: calm, transitionAccepted: false });
    expect(requested.allowModeInvitation).toBe(true);
    expect(requested.allowActionDraft).toBe(false);
    const organize = chooseResponsePlan({ currentMode: "companion", intent: "organize", riskLevel: "low", state: calm, transitionAccepted: true });
    expect(organize.allowActionDraft).toBe(true);
    expect(organize.surfaceMode).toBe("organize");
  });

  it("lets the user return from organize to companion mode", () => {
    const plan = chooseResponsePlan({ currentMode: "organize", intent: "talk", riskLevel: "low", state: calm, transitionAccepted: false });
    expect(plan.surfaceMode).toBe("companion");
    expect(plan.allowActionDraft).toBe(false);
    expect(plan.allowModeInvitation).toBe(false);
  });

  it("does not invite organization on the first distress message", () => {
    const firstTurn = chooseResponsePlan({ currentMode: "companion", intent: "auto", riskLevel: "low", state: calm, transitionAccepted: false, wasRecentlySupported: false });
    expect(firstTurn.allowModeInvitation).toBe(false);
    expect(firstTurn.sceneState).toBe("underwater_companion");
    const laterTurn = chooseResponsePlan({ currentMode: "companion", intent: "auto", riskLevel: "low", state: calm, transitionAccepted: false, wasRecentlySupported: true });
    expect(laterTurn.allowModeInvitation).toBe(true);
  });
});
