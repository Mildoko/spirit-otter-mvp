import type { EmotionState, ResponsePlan, RiskLevel, SurfaceMode } from "@otter/shared";

export interface PolicyInput {
  currentMode: SurfaceMode;
  intent: "auto" | "talk" | "organize";
  riskLevel: RiskLevel;
  state: EmotionState;
  transitionAccepted: boolean;
  wasRecentlySupported?: boolean;
}

export function chooseResponsePlan(input: PolicyInput): ResponsePlan {
  if (input.riskLevel === "high" || input.riskLevel === "imminent") {
    return {
      surfaceMode: "companion",
      supportMode: "stabilize",
      sceneState: "safety_plain",
      primaryStrategy: "direct_safety_response",
      allowModeInvitation: false,
      allowActionDraft: false,
      allowedContent: ["直接确认当下安全", "鼓励联系现场研究人员与现实支持"],
      forbiddenContent: ["任务建议", "诊断", "水域隐喻", "角色依赖", "grounding 指令"],
    };
  }

  const elevated = input.riskLevel === "elevated" || input.state.arousal >= 0.75;
  if (elevated) {
    return {
      surfaceMode: "companion",
      supportMode: "stabilize",
      sceneState: "underwater_companion",
      primaryStrategy: "validate_and_clarify",
      allowModeInvitation: false,
      allowActionDraft: false,
      allowedContent: ["共情", "复述", "澄清", "鼓励现实支持"],
      forbiddenContent: ["诊断", "立即解决", "任务清单", "依赖强化"],
    };
  }

  if (input.intent === "talk") {
    return {
      surfaceMode: "companion",
      supportMode: "validate",
      sceneState: "underwater_companion",
      primaryStrategy: "empathy_reflection",
      allowModeInvitation: false,
      allowActionDraft: false,
      allowedContent: ["共情", "复述", "澄清", "不急于解决"],
      forbiddenContent: ["诊断", "未经同意的建议", "任务清单", "情感绑架"],
    };
  }

  const organize = input.currentMode === "organize" || input.transitionAccepted;
  if (organize) {
    return {
      surfaceMode: "organize",
      supportMode: "mobilize",
      sceneState: "surface_organize",
      primaryStrategy: "one_small_action",
      allowModeInvitation: false,
      allowActionDraft: true,
      allowedContent: ["简短承接", "一个低负担行动", "允许用户修改或放弃"],
      forbiddenContent: ["多个并列任务", "催促", "羞耻", "诊断", "依赖强化"],
    };
  }

  const canInvite = input.intent === "organize" || (Boolean(input.wasRecentlySupported) && (input.state.stressLoad > 0.55 || input.state.cognitiveOverload > 0.55));
  return {
    surfaceMode: "companion",
    supportMode: "clarify",
    sceneState: canInvite ? "near_surface_transition" : "underwater_companion",
    primaryStrategy: "empathy_reflection",
    allowModeInvitation: canInvite,
    allowActionDraft: false,
    allowedContent: ["共情", "复述", "澄清", "不急于解决"],
    forbiddenContent: ["诊断", "未经同意的建议", "任务清单", "情感绑架"],
  };
}
