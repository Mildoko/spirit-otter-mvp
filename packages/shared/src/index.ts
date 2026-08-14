export type ActiveSpirit = "deep_tide" | "shore_pick";
export type TransitionStyle = "steady" | "blend_to_deep" | "blend_to_shore";
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
export type RuntimeMode = "full" | "demo" | "lab";
export type ResponseSource = "cloud_model" | "local_fallback" | "static_safety";

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
  ruleCodes?: string[];
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
  activeSpirit: ActiveSpirit;
  transitionStyle: TransitionStyle;
  supportMode: SupportMode;
  sceneState: SceneState;
  primaryStrategy: string;
  allowActionDraft: boolean;
  routeReasonCodes: string[];
  lockTurnsRemaining: number;
  allowedContent: string[];
  forbiddenContent: string[];
}

export interface CharacterCard {
  id: "core_soul" | ActiveSpirit;
  version: string;
  name: string;
  purpose: string;
  beliefs: string[];
  voice: string[];
  responseContract: string[];
  forbidden: string[];
  examples: Array<{ user: string; assistant: string }>;
}

export interface CharacterDiagnostics {
  activeSpirit: ActiveSpirit;
  transitionStyle: TransitionStyle;
  reasonCodes: string[];
  lockTurnsRemaining: number;
  characterVersion: string;
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

export type MemoryKind = "user_fact" | "user_preference" | "boundary" | "episode" | "relationship_milestone" | "support_strategy";
export type MemoryOrigin = "user_explicit" | "model_inference";
export type MemorySensitivity = "normal" | "personal" | "sensitive" | "highly_sensitive";
export type MemoryStatus = "active" | "superseded" | "expired" | "deleted";

export interface MemoryCandidate {
  kind: MemoryKind;
  content: string;
  structuredKey: string;
  structuredValue?: string;
  origin: MemoryOrigin;
  sensitivity: MemorySensitivity;
  importance: number;
  confidence: number;
  evidence: string;
}

export interface PromptMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  observedAt: string;
  relevanceNote: "current_preference" | "historical_event" | "relationship_context";
}

export interface PublicEmotionCue {
  dimension: "valence" | "arousal" | "stress" | "overload" | "support";
  text: string;
  tone: "softening" | "steady" | "intensifying";
}

export type EmotionDimension = "valence" | "arousal" | "stressLoad" | "cognitiveOverload" | "supportNeed";

export interface EmotionDiagnostics {
  observedAt: string;
  raw: Pick<EmotionState, EmotionDimension>;
  smoothed: Pick<EmotionState, EmotionDimension>;
  changes: Record<EmotionDimension, number>;
  confidence: number;
  evidenceSpans: string[];
  signalSource: "cloud_model" | "local_fallback";
}

export interface RuntimeInfo {
  mode: RuntimeMode;
  persistent: boolean;
  modelSource: "cloud_model" | "local_fallback";
  buildVersion: string;
  emotionDiagnosticsAvailable: boolean;
}

export interface PublicEmotionFeedback {
  observedAt: string;
  disclaimer: string;
  cues: PublicEmotionCue[];
}

export interface ChatTurnResponse {
  turnId: string;
  reply: PublicMessage;
  scene: SceneState;
  action?: PublicActionItem;
  safety: "normal" | "direct_support";
  responseSource: ResponseSource;
  emotionFeedback?: PublicEmotionFeedback;
  emotionDiagnostics?: EmotionDiagnostics;
  characterDiagnostics?: CharacterDiagnostics;
}
