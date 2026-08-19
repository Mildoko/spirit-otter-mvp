import type {
  ActiveSpirit,
  EmotionCorrectionV1,
  EmotionHypothesisV1,
  EmotionState,
  GuidanceStateV1,
  MemoryCandidate,
  MemoryRelationCandidateV1,
  PromptMemory,
  RawSignals,
  ResponsePlan,
  ResponseStyleResolution,
  ResponseStyleDiagnostics,
  ResponseSource,
  RiskLevel,
} from "@otter/shared";
import type { AppEnv } from "../../config/env.js";
import { CHARACTER_VERSION } from "../character/cards.js";
import { composeCharacterPrompt, type PromptActionContext } from "../character/prompt-composer.js";
import { resolveEmotionExpressionBrief } from "../character/emotion-expression.js";
import { resolveResponseStyle } from "../character/response-style.js";
import { detectDeliveredAccents } from "../character/language-registry.js";
import { validateGeneratedReply } from "../character/reply-validator.js";
import { filterMemoryCandidates } from "../memory/guard.js";
import { extractFallbackSignals } from "./fallback-signals.js";
import { resolveEmotionHypothesis } from "./emotion-inference.js";
import { mapEmotionState } from "./emotion-mapper.js";
import { smoothEmotionState } from "./emotion-smoothing.js";
import { LlmGateway, type LlmMetrics } from "./llm-gateway.js";
import { chooseResponsePlan, detectConversationIntent } from "./policy-router.js";
import { advanceGuidanceState, DEFAULT_GUIDANCE_STATE } from "./guidance-state.js";
import { resolveRiskLevel, runHardRiskGuard } from "./risk-guard.js";
import { fallbackReply, highRiskResponse } from "./static-responses.js";

export interface OrchestratorInput {
  text: string;
  currentSpirit: ActiveSpirit;
  spiritTurnCount: number;
  companionLockTurns: number;
  recentContext: string[];
  previousRawStates: EmotionState[];
  previousSmoothedState?: EmotionState;
  memories: PromptMemory[];
  actionContext?: PromptActionContext;
  guidanceState?: GuidanceStateV1;
  previousEmotionCorrection?: EmotionCorrectionV1;
}

export interface OrchestratorResult {
  signals: RawSignals;
  rawState: EmotionState;
  state: EmotionState;
  emotionHypothesis: EmotionHypothesisV1;
  riskLevel: RiskLevel;
  ruleCodes: string[];
  plan: ResponsePlan;
  nextSpiritTurnCount: number;
  nextCompanionLockTurns: number;
  reply: string;
  actionDraft: string | null;
  memoryCandidates: MemoryCandidate[];
  memoryRelationCandidates: MemoryRelationCandidateV1[];
  metrics: LlmMetrics[];
  signalSource: "cloud_model" | "local_fallback";
  responseSource: ResponseSource;
  characterVersion: string;
  responseStyle?: ResponseStyleResolution;
  responseStyleDiagnostics?: ResponseStyleDiagnostics;
  nextGuidanceState: GuidanceStateV1;
}

export class SupportOrchestrator {
  constructor(private readonly gateway: LlmGateway, private readonly env: AppEnv) {}

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const guidanceState = input.guidanceState ?? { ...DEFAULT_GUIDANCE_STATE };
    const hardRisk = runHardRiskGuard(input.text);
    const analyzed = hardRisk.level === "high" || hardRisk.level === "imminent"
      ? null
      : await this.gateway.analyze(input.text, this.env.EMOTION_INFERENCE_V2, input.recentContext);
    const fallbackSignals = extractFallbackSignals(input.text);
    const signals = analyzed?.signals ?? fallbackSignals;
    if (analyzed && signals.evidenceSpans.length === 0) {
      signals.expressionClarityScore = fallbackSignals.expressionClarityScore;
      signals.progressReadinessScore = fallbackSignals.progressReadinessScore;
      signals.ruleCodes = [...(signals.ruleCodes ?? []), "MODEL_LOW_SIGNAL_EVIDENCE_MISSING", ...(fallbackSignals.ruleCodes ?? [])];
    }
    if (hardRisk.level === "high" || hardRisk.level === "imminent") signals.modelRiskHint = hardRisk.level;
    const riskLevel = resolveRiskLevel(hardRisk.level, signals.modelRiskHint, signals);
    const emotionResolution = resolveEmotionHypothesis({
      text: input.text,
      signals,
      enabled: this.env.EMOTION_INFERENCE_V2,
      ...(input.previousEmotionCorrection ? { previousCorrection: input.previousEmotionCorrection } : {}),
    });
    const emotionHypothesis = emotionResolution.hypothesis;
    signals.emotionInference = emotionHypothesis;
    signals.ruleCodes = [...(signals.ruleCodes ?? []), ...emotionResolution.ruleCodes];
    const rawState = mapEmotionState(signals, emotionHypothesis);
    const state = smoothEmotionState(rawState, input.previousRawStates);
    const routed = chooseResponsePlan({
      text: input.text,
      currentSpirit: input.currentSpirit,
      spiritTurnCount: input.spiritTurnCount,
      companionLockTurns: input.companionLockTurns,
      riskLevel,
      state,
      signals,
      ...(input.previousSmoothedState ? { previousArousal: input.previousSmoothedState.arousal } : {}),
      wasRecentlySupported: input.recentContext.some((item) => item.startsWith("assistant:")),
      guidanceState,
    });
    const intent = detectConversationIntent(input.text, guidanceState);

    if (riskLevel === "high" || riskLevel === "imminent") {
      const finalReply = highRiskResponse(riskLevel, this.env.RESEARCH_CONTACT);
      return {
        signals,
        rawState,
        state,
        emotionHypothesis,
        riskLevel,
        ruleCodes: analyzed ? [...hardRisk.ruleCodes, "MODEL_HIGH_RISK"] : hardRisk.ruleCodes,
        plan: routed.plan,
        nextSpiritTurnCount: routed.nextSpiritTurnCount,
        nextCompanionLockTurns: routed.nextCompanionLockTurns,
        reply: finalReply,
        actionDraft: null,
        memoryCandidates: [],
        memoryRelationCandidates: [],
        metrics: analyzed ? [analyzed.metrics] : [],
        signalSource: analyzed ? "cloud_model" : "local_fallback",
        responseSource: "static_safety",
        characterVersion: CHARACTER_VERSION,
        nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply, deliveredAccent: "none" }),
      };
    }

    const emotionPrompt = this.env.EMOTION_INFERENCE_V2
      ? { emotionHypothesis, emotionExpression: resolveEmotionExpressionBrief(emotionHypothesis, state) }
      : {};
    const responseStyle = resolveResponseStyle({ plan: routed.plan, state, recentContext: input.recentContext, userText: input.text, riskLevel, guidanceState, expressionV2Enabled: this.env.EXPRESSION_STYLE_V2, expressionClarityScore: signals.expressionClarityScore });
    const prompt = composeCharacterPrompt({
      plan: routed.plan,
      state,
      ...emotionPrompt,
      style: responseStyle,
      memories: input.memories,
      ...(input.actionContext ? { actionContext: input.actionContext } : {}),
      recentContext: input.recentContext,
      userText: input.text,
    });
    const [generated, extracted] = await Promise.all([
      this.gateway.generate(prompt),
      this.gateway.extractMemories(input.text, input.memories),
    ]);
    const fallback = fallbackReply({
      plan: routed.plan,
      style: responseStyle,
      state,
      userText: input.text,
      recentContext: input.recentContext,
      ...emotionPrompt,
    });
    let selected = generated;
    let validationStatus: ResponseStyleDiagnostics["validationStatus"] = generated ? "passed" : "fallback";
    let violationCodes: string[] = [];
    let rejectedViolationCodes: string[] = [];
    let repairMetric: LlmMetrics | undefined;
    if (generated) {
      const initialValidation = validateGeneratedReply({
        reply: generated.reply,
        actionDraft: generated.actionDraft,
        plan: routed.plan,
        style: responseStyle,
        ...(this.env.EMOTION_INFERENCE_V2 ? { emotionHypothesis } : {}),
        userText: input.text,
        recentContext: input.recentContext,
      });
      violationCodes = initialValidation.violations.map((item) => item.code);
      if (!initialValidation.ok) {
        rejectedViolationCodes = [...violationCodes];
        const repaired = await this.gateway.repairGeneratedReply(prompt, generated, violationCodes);
        if (repaired) {
          repairMetric = repaired.metrics;
          const repairedValidation = validateGeneratedReply({
            reply: repaired.reply,
            actionDraft: repaired.actionDraft,
            plan: routed.plan,
            style: responseStyle,
            ...(this.env.EMOTION_INFERENCE_V2 ? { emotionHypothesis } : {}),
            userText: input.text,
            recentContext: input.recentContext,
          });
          violationCodes = repairedValidation.violations.map((item) => item.code);
          if (repairedValidation.hardValid) {
            selected = repaired;
            validationStatus = "repaired";
          } else {
            rejectedViolationCodes = [...violationCodes];
            selected = null;
            validationStatus = "fallback";
          }
        } else if (!initialValidation.hardValid) {
          selected = null;
          validationStatus = "fallback";
        }
      }
    }
    if (!selected) {
      const fallbackValidation = validateGeneratedReply({
        reply: fallback.reply,
        actionDraft: fallback.actionDraft,
        plan: routed.plan,
        style: responseStyle,
        ...(this.env.EMOTION_INFERENCE_V2 ? { emotionHypothesis } : {}),
        userText: input.text,
        recentContext: input.recentContext,
      });
      violationCodes = fallbackValidation.violations.map((item) => item.code);
    }
    const finalReply = selected?.reply ?? fallback.reply;
    const deliveredAccents = detectDeliveredAccents(finalReply);
    const deliveredAccent = deliveredAccents.length === 1 ? deliveredAccents[0]! : "none";
    return {
      signals,
      rawState,
      state,
      emotionHypothesis,
      riskLevel,
      ruleCodes: hardRisk.ruleCodes,
      plan: routed.plan,
      nextSpiritTurnCount: routed.nextSpiritTurnCount,
      nextCompanionLockTurns: routed.nextCompanionLockTurns,
      reply: finalReply,
      actionDraft: routed.plan.allowActionDraft ? (selected?.actionDraft ?? fallback.actionDraft) : null,
      memoryCandidates: filterMemoryCandidates(extracted?.memories ?? [], input.text),
      memoryRelationCandidates: extracted?.relations ?? [],
      metrics: [analyzed?.metrics, generated?.metrics, repairMetric, extracted?.metrics].filter((metric): metric is LlmMetrics => Boolean(metric)),
      signalSource: analyzed ? "cloud_model" : "local_fallback",
      responseSource: selected ? "cloud_model" : "local_fallback",
      characterVersion: CHARACTER_VERSION,
      responseStyle,
      responseStyleDiagnostics: {
        profile: responseStyle.profile,
        reasonCodes: responseStyle.reasonCodes,
        avoidedPatterns: responseStyle.avoidPhrases,
        validationStatus,
        violationCodes,
        ...(validationStatus === "fallback" && rejectedViolationCodes.length ? { rejectedViolationCodes } : {}),
        styleVersion: responseStyle.styleVersion,
      },
      nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply, deliveredAccent }),
    };
  }
}
