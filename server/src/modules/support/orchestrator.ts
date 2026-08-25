import type {
  ActiveSpirit,
  AgentIdV1,
  EmotionCorrectionV1,
  EmotionHypothesisV1,
  EmotionState,
  GuidanceState,
  HealingBriefV1,
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
import { composePublicAgentPrompt, PUBLIC_AGENT_CHARACTER_VERSION, publicAgentFallbackReply, validatePublicAgentReply } from "../character/public-agent-prompt.js";
import { validateGeneratedReply } from "../character/reply-validator.js";
import { filterMemoryCandidates } from "../memory/guard.js";
import { buildSkillDiagnostics, fallbackForSkill, nextTopicSkillState } from "../skills/harness.js";
import { resolveTopicSkill } from "../skills/registry.js";
import type { SkillDiagnostics, SkillResolution } from "../skills/types.js";
import { deactivateTopicLead, resolveTopicLeadTurn } from "../topics/topic-lead.js";
import { healingFallbackReply } from "../healing/fallback-cards.js";
import { inactiveHealingBrief, planHealingTurn, type HealingScenario } from "../healing/planner.js";
import { extractFallbackSignals } from "./fallback-signals.js";
import { resolveEmotionHypothesis } from "./emotion-inference.js";
import { mapEmotionState } from "./emotion-mapper.js";
import { smoothEmotionState } from "./emotion-smoothing.js";
import { LlmGateway, type HealingCritique, type LlmMetrics } from "./llm-gateway.js";
import { chooseResponsePlan, detectConversationIntent } from "./policy-router.js";
import { advanceGuidanceState, parseGuidanceState } from "./guidance-state.js";
import { resolveRiskLevel, runHardRiskGuard } from "./risk-guard.js";
import { fallbackReply, highRiskResponse } from "./static-responses.js";
import { resolveCurrentDateReply } from "./runtime-facts.js";

export interface OrchestratorInput {
  text: string;
  agentId?: AgentIdV1;
  currentSpirit: ActiveSpirit;
  spiritTurnCount: number;
  companionLockTurns: number;
  recentContext: string[];
  previousRawStates: EmotionState[];
  previousSmoothedState?: EmotionState;
  memories: PromptMemory[];
  actionContext?: PromptActionContext;
  guidanceState?: GuidanceState;
  previousEmotionCorrection?: EmotionCorrectionV1;
  deepInterpretationEnabled?: boolean;
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
  nextGuidanceState: ReturnType<typeof parseGuidanceState>;
  skillResolution: SkillResolution;
  skillDiagnostics: SkillDiagnostics;
  healingBrief: HealingBriefV1;
  healingScenario: HealingScenario;
}

export class SupportOrchestrator {
  constructor(
    private readonly gateway: LlmGateway,
    private readonly env: AppEnv,
    private readonly now: () => Date = () => new Date(),
    private readonly topicRandom: () => number = Math.random,
  ) {}

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const activeAgentId = input.agentId ?? "zen_deer";
    const guidanceState = parseGuidanceState(input.guidanceState);
    if (input.deepInterpretationEnabled !== undefined) guidanceState.healing.deepAnalysisEnabled = input.deepInterpretationEnabled;
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
    const healingResolution = planHealingTurn({ text: input.text, riskLevel, state, guidanceState, now: this.now() });
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
      healingBrief: healingResolution.brief,
    });
    const intent = detectConversationIntent(input.text, guidanceState);
    const skillResolution = resolveTopicSkill({
      text: input.text,
      recentContext: input.recentContext,
      riskLevel,
      plan: routed.plan,
      state: guidanceState.topicSkill,
      astrologyEnabled: this.env.ASTROLOGY_SKILL_V1,
    });
    const nextTopicState = nextTopicSkillState(guidanceState.topicSkill, skillResolution, guidanceState.turnIndex + 1);
    const topicStrategy = ["open_topic", "switch_topic", "continue_topic"].includes(routed.plan.primaryStrategy);
    const effectiveNoQuestions = intent.allowQuestions ? false : intent.requestNoQuestions || guidanceState.userRequestedNoQuestions;
    const topicSource = intent.lowSignalTopicCue && !intent.requestTopicLead && !intent.requestTopicSwitch ? "low_signal" as const : "explicit_request" as const;
    const topicTurn = skillResolution.status === "active" ? null : resolveTopicLeadTurn({
      plan: routed.plan,
      previous: guidanceState.topicLead,
      turnIndex: guidanceState.turnIndex + 1,
      source: topicSource,
      noQuestions: effectiveNoQuestions,
      random: this.topicRandom,
    });
    const nextTopicLead = topicTurn?.nextState
      ?? (topicStrategy && skillResolution.status === "active" ? guidanceState.topicLead : deactivateTopicLead(guidanceState.topicLead));
    const healingBrief = topicTurn || skillResolution.status === "active" || currentUtilityTurn(input.text)
      ? inactiveHealingBrief()
      : healingResolution.brief;

    if (riskLevel === "high" || riskLevel === "imminent") {
      const finalReply = highRiskResponse(riskLevel, this.env.RESEARCH_CONTACT, input.text);
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
        skillResolution,
        skillDiagnostics: buildSkillDiagnostics(skillResolution, []),
        healingBrief,
        healingScenario: healingResolution.scenario,
        nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply, deliveredAccent: "none", topicSkill: nextTopicState, topicLead: deactivateTopicLead(guidanceState.topicLead), healingBrief, deepAnalysisEnabled: healingResolution.deepAnalysisEnabled, resetHealing: true, now: this.now() }),
      };
    }

    if (activeAgentId !== "zen_deer") {
      const prompt = composePublicAgentPrompt({
        agentId: activeAgentId,
        userText: input.text,
        recentContext: input.recentContext,
      });
      const generated = await this.gateway.generate(prompt);
      const generatedValid = Boolean(generated && validatePublicAgentReply(activeAgentId, generated.reply, generated.actionDraft));
      const finalReply = generatedValid && generated ? generated.reply : publicAgentFallbackReply(activeAgentId, input.text);
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
        actionDraft: null,
        memoryCandidates: [],
        memoryRelationCandidates: [],
        metrics: [analyzed?.metrics, generated?.metrics].filter((metric): metric is LlmMetrics => Boolean(metric)),
        signalSource: analyzed ? "cloud_model" : "local_fallback",
        responseSource: generatedValid ? "cloud_model" : "local_fallback",
        characterVersion: PUBLIC_AGENT_CHARACTER_VERSION,
        skillResolution,
        skillDiagnostics: buildSkillDiagnostics(skillResolution, generated && !generatedValid ? ["PUBLIC_AGENT_ROLE_MISMATCH"] : []),
        healingBrief: inactiveHealingBrief(),
        healingScenario: healingResolution.scenario,
        nextGuidanceState: advanceGuidanceState({
          previous: guidanceState,
          intent,
          signals,
          plan: routed.plan,
          finalReply,
          deliveredAccent: "none",
          topicSkill: nextTopicState,
          topicLead: nextTopicLead,
          healingBrief: inactiveHealingBrief(),
          deepAnalysisEnabled: healingResolution.deepAnalysisEnabled,
          now: this.now(),
        }),
      };
    }

    const currentDateReply = resolveCurrentDateReply(input.text, this.now(), this.env.APP_TIME_ZONE);
    if (currentDateReply) {
      return {
        signals, rawState, state, emotionHypothesis, riskLevel, ruleCodes: hardRisk.ruleCodes,
        plan: routed.plan, nextSpiritTurnCount: routed.nextSpiritTurnCount, nextCompanionLockTurns: routed.nextCompanionLockTurns,
        reply: currentDateReply, actionDraft: null, memoryCandidates: [], memoryRelationCandidates: [],
        metrics: analyzed ? [analyzed.metrics] : [], signalSource: analyzed ? "cloud_model" : "local_fallback",
        responseSource: "local_fallback", characterVersion: CHARACTER_VERSION,
        skillResolution, skillDiagnostics: buildSkillDiagnostics(skillResolution, []),
        healingBrief: inactiveHealingBrief(), healingScenario: healingResolution.scenario,
        nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply: currentDateReply, deliveredAccent: "none", topicSkill: nextTopicState, topicLead: guidanceState.topicLead, healingBrief: inactiveHealingBrief(), deepAnalysisEnabled: healingResolution.deepAnalysisEnabled, now: this.now() }),
      };
    }

    const blockedSkillReply = skillResolution.status === "blocked"
      && skillResolution.reasonCodes.some((code) => ["ASTROLOGY_USER_OPTOUT", "ASTROLOGY_HIGH_STAKES_BOUNDARY", "ASTROLOGY_PRECISE_CHART_UNAVAILABLE"].includes(code))
      ? fallbackForSkill(input.text, skillResolution)
      : null;
    if (blockedSkillReply && !topicTurn) {
      return {
        signals, rawState, state, emotionHypothesis, riskLevel, ruleCodes: hardRisk.ruleCodes,
        plan: routed.plan, nextSpiritTurnCount: routed.nextSpiritTurnCount, nextCompanionLockTurns: routed.nextCompanionLockTurns,
        reply: blockedSkillReply, actionDraft: null, memoryCandidates: [], memoryRelationCandidates: [],
        metrics: analyzed ? [analyzed.metrics] : [], signalSource: analyzed ? "cloud_model" : "local_fallback",
        responseSource: "local_fallback", characterVersion: CHARACTER_VERSION,
        skillResolution, skillDiagnostics: buildSkillDiagnostics(skillResolution, []),
        healingBrief: inactiveHealingBrief(), healingScenario: healingResolution.scenario,
        nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply: blockedSkillReply, deliveredAccent: "none", topicSkill: nextTopicState, topicLead: deactivateTopicLead(guidanceState.topicLead), healingBrief: inactiveHealingBrief(), deepAnalysisEnabled: healingResolution.deepAnalysisEnabled, now: this.now() }),
      };
    }

    const emotionPrompt = this.env.EMOTION_INFERENCE_V2 && !topicTurn
      ? { emotionHypothesis, emotionExpression: resolveEmotionExpressionBrief(emotionHypothesis, state) }
      : {};
    const responseStyle = resolveResponseStyle({ plan: routed.plan, state, recentContext: input.recentContext, userText: input.text, riskLevel, guidanceState, interactionMode: topicTurn ? "casual_topic" : skillResolution.interactionMode, expressionV2Enabled: this.env.EXPRESSION_STYLE_V2, expressionClarityScore: signals.expressionClarityScore, healingBrief });
    const prompt = composeCharacterPrompt({
      plan: routed.plan,
      state,
      ...emotionPrompt,
      style: responseStyle,
      memories: input.memories,
      ...(input.actionContext ? { actionContext: input.actionContext } : {}),
      recentContext: input.recentContext,
      userText: input.text,
      skill: skillResolution,
      ...(topicTurn ? { topicLead: topicTurn } : {}),
      ...(healingBrief.status !== "inactive" ? { healingBrief } : {}),
    });
    const [generated, extracted] = await Promise.all([
      this.gateway.generate(prompt),
      skillResolution.skillId === "astrology" || topicTurn?.suppressMemory || healingBrief.status === "repairing" ? Promise.resolve(null) : this.gateway.extractMemories(input.text, input.memories),
    ]);
    const generationFailure = generated ? null : this.gateway.getLastFailure("generate");
    const skillFallback = skillResolution.status === "active" ? fallbackForSkill(input.text, skillResolution) : null;
    const authoredHealingFallback = healingBrief.status !== "inactive" && !routed.plan.allowActionDraft
      ? healingFallbackReply({ scenario: healingResolution.scenario, brief: healingBrief, noQuestions: effectiveNoQuestions })
      : null;
    const fallback = topicTurn
      ? { reply: topicTurn.fallbackReply, actionDraft: null }
      : skillFallback
      ? { reply: skillFallback, actionDraft: null }
      : authoredHealingFallback
      ? { reply: authoredHealingFallback, actionDraft: null }
      : fallbackReply({
          plan: routed.plan,
          style: responseStyle,
          state,
          userText: input.text,
          recentContext: input.recentContext,
          ...(input.actionContext ? { actionContext: input.actionContext } : {}),
          ...emotionPrompt,
        });
    let selected = generated;
    let validationStatus: ResponseStyleDiagnostics["validationStatus"] = generated ? "passed" : "fallback";
    let violationCodes: string[] = [];
    let rejectedViolationCodes: string[] = [];
    let initialViolationCodes: string[] = [];
    let repairViolationCodes: string[] = [];
    let fallbackStage: NonNullable<ResponseStyleDiagnostics["fallback"]>["stage"] | null = generated ? null : "generation";
    let fallbackProviderFailure = generationFailure;
    let repairMetric: LlmMetrics | undefined;
    let critiqueMetric: LlmMetrics | undefined;
    let repairCritiqueMetric: LlmMetrics | undefined;
    if (generated) {
      const initialValidation = validateGeneratedReply({
        reply: generated.reply,
        actionDraft: generated.actionDraft,
        plan: routed.plan,
        style: responseStyle,
        ...(this.env.EMOTION_INFERENCE_V2 ? { emotionHypothesis } : {}),
        userText: input.text,
        recentContext: input.recentContext,
        skill: skillResolution,
        ...(topicTurn ? { topicLead: topicTurn } : {}),
        ...(healingBrief.status !== "inactive" ? { healingBrief } : {}),
      });
      const initialCritique = healingBrief.status === "inactive"
        ? null
        : await this.gateway.critiqueHealing({ userText: input.text, reply: generated.reply, brief: healingBrief });
      critiqueMetric = initialCritique?.metrics;
      violationCodes = uniqueCodes([
        ...initialValidation.violations.map((item) => item.code),
        ...healingCritiqueViolationCodes(initialCritique, healingBrief),
      ]);
      initialViolationCodes = [...violationCodes];
      if (!initialValidation.ok || healingCritiqueViolationCodes(initialCritique, healingBrief).length > 0) {
        rejectedViolationCodes = [...violationCodes];
        const repaired = await this.gateway.repairGeneratedReply(prompt, generated, violationCodes);
        const repairFailure = repaired ? null : this.gateway.getLastFailure("repair");
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
            skill: skillResolution,
            ...(topicTurn ? { topicLead: topicTurn } : {}),
            ...(healingBrief.status !== "inactive" ? { healingBrief } : {}),
          });
          const repairedCritique = healingBrief.status === "inactive"
            ? null
            : await this.gateway.critiqueHealing({ userText: input.text, reply: repaired.reply, brief: healingBrief });
          repairCritiqueMetric = repairedCritique?.metrics;
          const repairCritiqueCodes = healingCritiqueViolationCodes(repairedCritique, healingBrief);
          violationCodes = uniqueCodes([
            ...repairedValidation.violations.map((item) => item.code),
            ...repairCritiqueCodes,
          ]);
          repairViolationCodes = [...violationCodes];
          if (repairedValidation.hardValid && repairCritiqueCodes.length === 0) {
            selected = repaired;
            validationStatus = "repaired";
          } else {
            rejectedViolationCodes = [...violationCodes];
            selected = null;
            validationStatus = "fallback";
            fallbackStage = "repair_validation";
          }
        } else if (!initialValidation.hardValid || healingCritiqueViolationCodes(initialCritique, healingBrief).length > 0) {
          selected = null;
          validationStatus = "fallback";
          fallbackStage = "repair_generation";
          fallbackProviderFailure = repairFailure;
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
        skill: skillResolution,
        ...(topicTurn ? { topicLead: topicTurn } : {}),
        ...(healingBrief.status !== "inactive" ? { healingBrief } : {}),
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
      actionDraft: skillResolution.status === "active" || topicTurn ? null : routed.plan.allowActionDraft ? (selected?.actionDraft ?? fallback.actionDraft) : null,
      memoryCandidates: topicTurn?.suppressMemory || healingBrief.status === "repairing" ? [] : filterMemoryCandidates(extracted?.memories ?? [], input.text).filter((candidate) => healingBrief.status === "inactive" || (candidate.kind === "support_strategy" && candidate.origin === "user_explicit")),
      memoryRelationCandidates: topicTurn?.suppressMemory || healingBrief.status !== "inactive" ? [] : extracted?.relations ?? [],
      metrics: [analyzed?.metrics, generated?.metrics, critiqueMetric, repairMetric, repairCritiqueMetric, extracted?.metrics].filter((metric): metric is LlmMetrics => Boolean(metric)),
      signalSource: analyzed ? "cloud_model" : "local_fallback",
      responseSource: selected ? "cloud_model" : "local_fallback",
      characterVersion: CHARACTER_VERSION,
      skillResolution,
      skillDiagnostics: buildSkillDiagnostics(skillResolution, violationCodes),
      healingBrief,
      healingScenario: healingResolution.scenario,
      responseStyle,
      responseStyleDiagnostics: {
        profile: responseStyle.profile,
        reasonCodes: responseStyle.reasonCodes,
        avoidedPatterns: responseStyle.avoidPhrases,
        validationStatus,
        violationCodes,
        ...(validationStatus === "fallback" && rejectedViolationCodes.length ? { rejectedViolationCodes } : {}),
        ...(validationStatus === "fallback" && fallbackStage ? {
          fallback: {
            stage: fallbackStage,
            ...(fallbackProviderFailure ? { providerFailure: fallbackProviderFailure } : {}),
            initialViolationCodes,
            repairViolationCodes,
          },
        } : {}),
        styleVersion: responseStyle.styleVersion,
      },
      nextGuidanceState: advanceGuidanceState({ previous: guidanceState, intent, signals, plan: routed.plan, finalReply, deliveredAccent, topicSkill: nextTopicState, topicLead: nextTopicLead, healingBrief, deepAnalysisEnabled: healingResolution.deepAnalysisEnabled, now: this.now() }),
    };
  }
}

function currentUtilityTurn(text: string): boolean {
  return /(?:今天|现在).{0,4}(?:几号|星期几|什么日子)|(?:几点|日期)|(?:什么是|是什么意思|谁是|在哪里|多少|怎么计算|帮我翻译|天气|代码报错|解释一下)/u.test(text);
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

function healingCritiqueViolationCodes(critique: HealingCritique | null, brief: HealingBriefV1): string[] {
  if (!critique || brief.status === "inactive") return [];
  return uniqueCodes([
    ...(brief.insight && !critique.groundedInsight ? ["UNSUPPORTED_DEEP_INSIGHT"] : []),
    ...(!critique.addsValueBeyondParaphrase ? ["PARAPHRASE_ONLY"] : []),
    ...(brief.status === "repairing" && !critique.ruptureRepaired ? ["MISSED_RUPTURE_REPAIR"] : []),
    ...(!critique.avoidsEmptyReassurance ? ["EMPTY_COMPANIONSHIP"] : []),
    ...(!critique.avoidsForcedPositiveMeaning ? ["UNSUPPORTED_POSITIVE_REFRAME"] : []),
  ]);
}
