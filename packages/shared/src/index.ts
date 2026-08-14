export type SurfaceMode = "companion" | "organize";
export type SupportMode = "stabilize" | "validate" | "clarify" | "mobilize";
export type SceneState =
  | "quiet_water"
  | "underwater_companion"
  | "near_surface_transition"
  | "surface_organize"
  | "safety_plain";
export type RiskLevel = "low" | "elevated" | "high" | "imminent";
export type TurnStatus = "reserved" | "processing" | "completed" | "failed";
export type ActionStatus = "draft" | "confirmed" | "completed" | "deferred" | "deleted";

export interface ProviderCapabilities {
  jsonMode: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  usageMetadata: boolean;
}

export interface RawSignals {
  sentimentPolarity: number;
  urgencyScore: number;
  helplessnessScore: number;
  overloadCueScore: number;
  taskPressureScore: number;
  supportSeekingScore: number;
  evidenceSpans: string[];
  confidence: number;
  modelRiskHint: RiskLevel;
}

export interface EmotionState {
  valence: number;
  arousal: number;
  stressLoad: number;
  cognitiveOverload: number;
  supportNeed: number;
  confidence: number;
  evidenceSpans: string[];
  validUntil: string;
}

export interface ResponsePlan {
  surfaceMode: SurfaceMode;
  supportMode: SupportMode;
  sceneState: SceneState;
  primaryStrategy: string;
  allowModeInvitation: boolean;
  allowActionDraft: boolean;
  allowedContent: string[];
  forbiddenContent: string[];
}

export interface PublicMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface PublicActionItem {
  id: string;
  text: string;
  status: ActionStatus;
  createdAt: string;
}

export interface PublicFollowup {
  id: string;
  actionId: string;
  dueAt: string;
  status: "pending" | "completed" | "deferred" | "closed" | "deleted";
  action: PublicActionItem;
}

export interface ModeTransitionOffer {
  id: string;
  prompt: string;
}

export interface PublicEmotionCue {
  dimension: "valence" | "arousal" | "stress" | "overload";
  text: string;
  tone: "softening" | "steady" | "intensifying";
}

export interface PublicEmotionFeedback {
  observedAt: string;
  disclaimer: string;
  cues: PublicEmotionCue[];
}

export interface ChatTurnResponse {
  turnId: string;
  reply: PublicMessage;
  mode: SurfaceMode;
  scene: SceneState;
  modeTransition?: ModeTransitionOffer;
  action?: PublicActionItem;
  safety: "normal" | "direct_support";
  emotionFeedback?: PublicEmotionFeedback;
}
