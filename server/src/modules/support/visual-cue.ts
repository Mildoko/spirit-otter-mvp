import type { ResponsePlan, RiskLevel, VisualCueV1 } from "@otter/shared";

export function buildVisualCue(input: {
  riskLevel: RiskLevel;
  plan: ResponsePlan;
  hasActionDraft: boolean;
}): VisualCueV1 {
  if (input.riskLevel !== "low") {
    return {
      schemaVersion: 1,
      agentId: "spirit_otter",
      action: "safety_still",
      intensity: 1,
      durationMs: 3200,
      ripple: "none",
      glow: "dim",
    };
  }

  const inviting = input.hasActionDraft || input.plan.supportMode === "mobilize";
  return {
    schemaVersion: 1,
    agentId: "spirit_otter",
    action: inviting ? "invite" : "speak",
    intensity: inviting ? 2 : 1,
    durationMs: inviting ? 2800 : 2400,
    ripple: inviting ? "clear" : "soft",
    glow: inviting ? "warm" : "normal",
  };
}
