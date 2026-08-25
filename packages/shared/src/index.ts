export type ActiveSpirit = "deep_tide" | "shore_pick";
export type TransitionStyle = "steady" | "blend_to_deep" | "blend_to_shore";
export type SupportMode = "stabilize" | "validate" | "clarify" | "mobilize" | "converse";
export type SceneState =
  | "quiet_water"
  | "underwater_companion"
  | "near_surface_transition"
  | "surface_organize"
  | "surface_chat"
  | "safety_plain";
export type RiskLevel = "low" | "elevated" | "high" | "imminent";
export type TurnStatus = "reserved" | "processing" | "completed" | "failed";
export type ActionStatus = "draft" | "confirmed" | "completed" | "deferred" | "deleted";
export type RuntimeMode = "full" | "demo" | "lab";
export type ResponseSource = "cloud_model" | "local_fallback" | "static_safety";
export type TopicSkillId = "astrology";
export type InteractionMode = "core_support" | "casual_topic";
export type HealingGoal = "felt_seen" | "emotional_softening" | "meaning_clarity" | "self_compassion" | "agency" | "reality_bridge";
export type HealingDepth = "recognize" | "deepen" | "integrate" | "bridge";
export type HealingRupture = "none" | "too_abstract" | "too_light" | "misread" | "unwanted_advice" | "not_helpful";
export type RealityPressure = "none" | "present" | "urgent_non_safety";
export type TopicLeadSource = "explicit_request" | "low_signal";
export type TopicCategory =
  | "imagination"
  | "daily_observation"
  | "culture_story"
  | "knowledge_curiosity"
  | "word_game"
  | "preference_tradeoff"
  | "creative_coauthoring"
  | "light_future";
export type AgentIdV1 = "zen_deer" | "spirit_otter" | "bird_courier";
export type AudioSfxV1 = "reply_ripple" | "invite_chime" | "none";
export type SoundscapePolicyV1 = "normal" | "reduced" | "silent";

export type WorldCircleV01 = "inner_private" | "outer_public";
export type OuterPortalLaneV01 = "happening_now" | "possibly_relevant" | "wander";
export type OuterPortalCoverThemeV01 = "lantern" | "koi" | "lotus";

/**
 * Public, curated content only. This contract deliberately has no user,
 * conversation, memory, emotion, astrology or contact fields.
 */
export interface PublicPortalItemV01 {
  id: string;
  lane: OuterPortalLaneV01;
  laneLabel: string;
  title: string;
  summary: string;
  detail: string;
  timeLabel: string;
  placeLabel: string;
  accessLabel: string;
  tags: string[];
  sourceLabel: string;
  coverTheme: OuterPortalCoverThemeV01;
  dataStatus: "demo";
}

export interface PublicPortalFeedV01 {
  schemaVersion: 1;
  circle: "outer_public";
  dataStatus: "demo";
  generatedAt: string;
  items: PublicPortalItemV01[];
  capabilities: {
    signup: false;
    contact: false;
    post: false;
    joinGroup: false;
    personalizedRecommendation: false;
  };
}

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
  fallback?: {
    stage: "generation" | "repair_generation" | "repair_validation";
    providerFailure?: {
      reason: "timeout" | "empty_response" | "invalid_json" | "schema_error" | "provider_error";
      detail: string | null;
    };
    initialViolationCodes: string[];
    repairViolationCodes: string[];
  };
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

export interface PublicAgentCharacterCard {
  id: AgentIdV1;
  version: string;
  publicName: "鹿禅" | "tata" | "飞儿";
  species: "鹿灵" | "水獭" | "飞鸟信差";
  role: string;
  voice: string[];
  responseContract: string[];
  signatureMoves: string[];
  forbiddenBorrowing: string[];
  examples: Array<{ user: string; assistant: string }>;
}

export interface HealingInsightV1 {
  claim: string;
  evidenceSpans: string[];
  confidence: number;
}

export interface HealingBriefV1 {
  schemaVersion: 1;
  status: "inactive" | "active" | "repairing";
  goal: HealingGoal;
  depth: HealingDepth;
  insight: HealingInsightV1 | null;
  rupture: HealingRupture;
  realityPressure: RealityPressure;
  allowedMoves: string[];
  forbiddenMoves: string[];
  replyOutline: string[];
}

interface GuidanceStateBase {
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

export interface GuidanceStateV1 extends GuidanceStateBase {
  schemaVersion: 1;
}

export interface TopicSkillGuidanceStateV1 {
  activeSkillId: TopicSkillId | null;
  activeVersion: string | null;
  lastActivatedTurn: number | null;
  suspendedSkillIds: TopicSkillId[];
}

export interface GuidanceStateV2 extends GuidanceStateBase {
  schemaVersion: 2;
  topicSkill: TopicSkillGuidanceStateV1;
}

export interface TopicLeadGuidanceStateV1 {
  status: "inactive" | "active";
  source: TopicLeadSource | null;
  currentTopicId: string | null;
  currentCategory: TopicCategory | null;
  startedAtTurn: number | null;
  lastActivityTurn: number | null;
  recentTopicIds: string[];
  recentCategories: TopicCategory[];
  rejectionCount: number;
}

export interface GuidanceStateV3 extends GuidanceStateBase {
  schemaVersion: 3;
  topicSkill: TopicSkillGuidanceStateV1;
  topicLead: TopicLeadGuidanceStateV1;
}

export interface HealingGuidanceStateV1 {
  segmentId: string;
  status: "inactive" | "active" | "repairing";
  depth: HealingDepth;
  lastGoal: HealingGoal | null;
  rupture: HealingRupture;
  consecutiveMissCount: number;
  lastActivityTurn: number | null;
  expiresAt: string | null;
  deepAnalysisEnabled: boolean;
}

export interface GuidanceStateV4 extends GuidanceStateBase {
  schemaVersion: 4;
  topicSkill: TopicSkillGuidanceStateV1;
  topicLead: TopicLeadGuidanceStateV1;
  healing: HealingGuidanceStateV1;
}

export type GuidanceState = GuidanceStateV1 | GuidanceStateV2 | GuidanceStateV3 | GuidanceStateV4;

export type HealingUnderstandingFeedback = "hit" | "partly" | "missed";
export type HealingMovementFeedback = "more_space" | "clearer" | "more_choice" | "unchanged" | "worse";
export type HealingNegativeReason = "too_shallow" | "too_analytical" | "too_generic" | "unwanted_advice" | "misread" | "other";

export interface HealingSessionFeedbackV1 {
  schemaVersion: 1;
  understanding: HealingUnderstandingFeedback;
  movement: HealingMovementFeedback;
  reason?: HealingNegativeReason;
}

export type ConversationFeedbackVerdict = "helpful" | "not_helpful";
export type ConversationFeedbackReason = "too_shallow" | "repetitive" | "too_analytical" | "too_generic" | "unwanted_advice" | "misread" | "topic_irrelevant" | "topic_not_switched" | "other";

export interface ConversationFeedbackV2 {
  schemaVersion: 2;
  verdict: ConversationFeedbackVerdict;
  understanding?: HealingUnderstandingFeedback;
  movement?: HealingMovementFeedback;
  reason?: ConversationFeedbackReason;
}

export interface ExperiencePreferencesV1 {
  deepInterpretationEnabled: boolean;
}

export interface PublicMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  agentId?: AgentIdV1;
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
  outcomeState: "not_started" | "partial_progress" | "completed" | "blocked" | "redefined";
  outcomeLabeledAt?: string | null;
  action: PublicActionItem;
}

export type MemoryKind = "user_fact" | "user_preference" | "boundary" | "episode" | "relationship_milestone" | "support_strategy";
export type MemoryOrigin = "user_explicit" | "model_inference";
export type MemorySensitivity = "normal" | "personal" | "sensitive" | "highly_sensitive";
export type MemoryStatus = "active" | "disabled" | "rejected" | "superseded" | "expired" | "deleted";
export type MemoryClaimStateV2 = "asserted" | "hypothesis" | "confirmed";
export type MemoryRelationTypeV1 = "involves" | "may_trigger" | "supports" | "contradicts" | "updates" | "related_to" | "part_of";
export type MemoryRelationStatusV1 = "active" | "disabled" | "rejected" | "expired";

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
  eventTimeText?: string;
}

export interface MemoryRelationCandidateV1 {
  sourceKey: string;
  targetKey: string;
  type: MemoryRelationTypeV1;
  origin: MemoryOrigin;
  confidence: number;
  evidence: string;
}

export interface MemoryExtractionV2 {
  memories: MemoryCandidate[];
  relations: MemoryRelationCandidateV1[];
}

export interface PromptMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  observedAt: string;
  relevanceNote: "current_preference" | "historical_event" | "relationship_context";
  structuredKey?: string;
  claimState?: MemoryClaimStateV2;
  relationNote?: string;
  relationId?: string;
}

export interface PublicMemoryEvidenceV2 {
  excerpt: string;
  capturedAt: string;
}

export interface PublicMemoryRelationV1 {
  id: string;
  type: MemoryRelationTypeV1;
  sourceMemoryId: string;
  targetMemoryId: string;
  sourceContent: string;
  targetContent: string;
  claimState: MemoryClaimStateV2;
  status: MemoryRelationStatusV1;
  confidence: number;
  observedAt: string;
}

export interface PublicMemoryV2 {
  schemaVersion: 2;
  id: string;
  kind: MemoryKind;
  content: string;
  structuredValue?: string;
  claimState: MemoryClaimStateV2;
  status: MemoryStatus;
  observedAt: string;
  eventAt?: string;
  validFrom: string;
  validTo?: string;
  evidence: PublicMemoryEvidenceV2[];
  relations: PublicMemoryRelationV1[];
}

export interface PublicMemoryPageV2 {
  items: PublicMemoryV2[];
  nextCursor?: string | undefined;
}

export type MemoryDecisionV2 =
  | { action: "confirm" }
  | { action: "disable" }
  | { action: "enable" }
  | { action: "reject" }
  | { action: "correct"; content: string; structuredValue?: string | undefined };

export type MemoryRelationDecisionV1 = { action: "confirm" | "disable" | "enable" | "reject" };

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
  cloudTtsEnabled: boolean;
  memoryV2Enabled: boolean;
}

export interface PublicEmotionFeedback {
  observedAt: string;
  disclaimer: string;
  cues: PublicEmotionCue[];
}

export interface ChatTurnResponse {
  turnId: string;
  reply: PublicMessage;
  activeAgentId: AgentIdV1;
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
