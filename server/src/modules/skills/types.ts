import type { InteractionMode, ResponsePlan, RiskLevel, TopicSkillGuidanceStateV1, TopicSkillId } from "@otter/shared";

export const SKILL_HARNESS_VERSION = "skill-harness-v1";

export type SkillCapability = "cultural_chat" | "sun_sign_lookup" | "self_reflection" | "compatibility_chat";
export type SkillActivationStatus = "inactive" | "active" | "blocked";
export type SkillActivationSource = "none" | "explicit_request" | "conversation_continuation";

export interface SkillResolution {
  status: SkillActivationStatus;
  skillId: TopicSkillId | null;
  skillVersion: string | null;
  interactionMode: InteractionMode;
  capability: SkillCapability | null;
  activationSource: SkillActivationSource;
  confidence: number;
  reasonCodes: string[];
  promptContext: string | null;
  suppressMemory: boolean;
}

export interface SkillDiagnostics {
  harnessVersion: string;
  skillId: TopicSkillId | null;
  skillVersion: string | null;
  status: SkillActivationStatus;
  capability: SkillCapability | null;
  activationSource: SkillActivationSource;
  reasonCodes: string[];
  violationCodes: string[];
}

export interface TopicSkillDefinition {
  id: TopicSkillId;
  version: string;
  capabilities: readonly SkillCapability[];
  resolve(input: {
    text: string;
    recentContext: string[];
    riskLevel: RiskLevel;
    plan: ResponsePlan;
    state: TopicSkillGuidanceStateV1;
    enabled: boolean;
  }): SkillResolution;
  fallback(input: { text: string; resolution: SkillResolution }): string;
}

export function inactiveSkill(reasonCode: string): SkillResolution {
  return {
    status: "inactive", skillId: null, skillVersion: null, interactionMode: "core_support",
    capability: null, activationSource: "none", confidence: 0, reasonCodes: [reasonCode],
    promptContext: null, suppressMemory: false,
  };
}
