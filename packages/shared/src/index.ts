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
export type AgentIdV1 = "spirit_otter";
export type AudioSfxV1 = "reply_ripple" | "invite_chime" | "none";
export type SoundscapePolicyV1 = "normal" | "reduced" | "silent";

export interface AudioCueV1 {
  schemaVersion: 1;
  agentId: AgentIdV1;
  voiceProfileId: string;
  sfx: AudioSfxV1;
  soundscapePolicy: SoundscapePolicyV1;
}

export type VisualActionV1 =
  | "idle"
  | "notice"
  | "approach"
  | "listen"
  | "think"
  | "speak"
  | "invite"
  | "withdraw"
  | "safety_still";

export interface VisualCueV1 {
  schemaVersion: 1;
  agentId: string;
  action: VisualActionV1;
  intensity: 1 | 2 | 3;
  durationMs: number;
  ripple: "none" | "soft" | "clear";
  glow: "dim" | "normal" | "warm";
}
export type ResponsePace = "very_slow" | "slow" | "steady" | "direct";
export type ResponseSentenceLength = "short" | "medium";
export type ResponseLength = "brief" | "normal";
export type ResponseWarmth = "restrained" | "warm" | "close";
export type ReflectionDepth = "fact" | "tension" | "meaning";
export type AdviceDirectness = "none" | "tentative" | "clear";
export type ResponseUncertainty = "low" | "medium" | "high";
export type Conversationality = "restrained" | "natural" | "close";
export type SentenceRhythm = "compact" | "mixed";
export type ExpressiveAccent = "none" | "metaphor" | "aphorism" | "dry_humor";
export type EmotionLabelV1 =
  | "joy" | "relief" | "hope" | "interest" | "gratitude"
  | "sadness" | "anger" | "anxiety" | "frustration" | "disappointment"
  | "disgust" | "shame" | "guilt" | "loneliness" | "surprise";
export type EmotionInferenceStatus = "inferred" | "neutral" | "unknown" | "user_corrected";
export type EmotionSubject = "user" | "other" | "mixed" | "unknown";

export interface EmotionLabelScoreV1 {
  label: EmotionLabelV1;
  intensity: number;
  confidence: number;
  evidenceSpans: string[];
}

export interface EmotionHypothesisV1 {
  schemaVersion: 1;
  status: EmotionInferenceStatus;
  subject: EmotionSubject;
  valence: number;
  arousal: number;
  control: number;
  labels: EmotionLabelScoreV1[];
  confidence: number;
}

export interface ResponseStyleProfile {
  pace: ResponsePace;
  sentenceLength: ResponseSentenceLength;
  responseLength: ResponseLength;
  warmth: ResponseWarmth;
  reflectionDepth: ReflectionDepth;
  questionBudget: 0 | 1;
  adviceDirectness: AdviceDirectness;
  uncertainty: ResponseUncertainty;
  conversationality: Conversationality;
  sentenceRhythm: SentenceRhythm;
  expressiveAccent: ExpressiveAccent;
}

export interface ResponseStyleResolution {
  profile: ResponseStyleProfile;
  reasonCodes: string[];
  avoidPhrases: string[];
  replyOutline: string[];
  styleVersion: string;
}

export interface ResponseStyleDiagnostics {
  profile: ResponseStyleProfile;
  reasonCodes: string[];
  avoidedPatterns: string[];
  validationStatus: "passed" | "repaired" | "fallback";
  violationCodes: string[];
  rejectedViolationCodes?: string[];
  styleVersion: string;
}

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
  expressionClarityScore: number;
  progressReadinessScore: number;
  evidenceSpans: string[];
  confidence: number;
  modelRiskHint: RiskLevel;
  ruleCodes?: string[];
  emotionInference?: EmotionHypothesisV1;
}

export interface EmotionState {
  valence: number;
  arousal: number;
  stressLoad: number;
  cognitiveOverload: number;
  supportNeed: number;
  control: number;
  emotionStatus: EmotionInferenceStatus;
  emotionLabels: EmotionLabelScoreV1[];
  emotionSubject: EmotionSubject;
  emotionSchemaVersion: 1;
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
  responseStyle?: ResponseStyleDiagnostics;
}

export interface GuidanceStateV1 {
  schemaVersion: 1;
  turnIndex: number;
  clarifyAttemptCount: number;
  transitionInvitePending: boolean;
  lastTransitionInviteTurn: number | null;
  transitionDeclined: boolean;
  userRequestedNoQuestions: boolean;
  lastMetaphorTurn: number | null;
  lastAphorismTurn: number | null;
  lastHumorTurn: number | null;
  lastExpressionClarity: number | null;
  lastProgressReadiness: number | null;
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
  control: number;
  emotionStatus: EmotionInferenceStatus;
  emotionLabels: EmotionLabelScoreV1[];
  emotionSubject: EmotionSubject;
}

export interface PublicEmotionLabelV1 {
  label: EmotionLabelV1;
  displayName: string;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
}

export interface PublicEmotionInterpretation {
  status: EmotionInferenceStatus;
  labels: PublicEmotionLabelV1[];
  disclaimer: string;
  canCorrect: boolean;
}

export interface EmotionCorrectionLabelV1 {
  label: EmotionLabelV1;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
}

export interface EmotionCorrectionV1 {
  turnId: string;
  verdict: "accurate" | "replace" | "unknown" | "neutral";
  labels: EmotionCorrectionLabelV1[];
  createdAt: string;
}

export interface RuntimeInfo {
  mode: RuntimeMode;
  persistent: boolean;
  modelSource: "cloud_model" | "local_fallback";
  buildVersion: string;
  emotionDiagnosticsAvailable: boolean;
  sceneWorldV1Enabled: boolean;
  audioV1Enabled: boolean;
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
  emotionInterpretation?: PublicEmotionInterpretation;
  characterDiagnostics?: CharacterDiagnostics;
  visualCue?: VisualCueV1;
  audioCue?: AudioCueV1;
}
