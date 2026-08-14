import type {
  ActiveSpirit,
  EmotionState,
  MemoryCandidate,
  PromptMemory,
  RawSignals,
  ResponsePlan,
  ResponseSource,
  RiskLevel,
} from "@otter/shared";
import type { AppEnv } from "../../config/env.js";
import { CHARACTER_VERSION } from "../character/cards.js";
import { composeCharacterPrompt, type PromptActionContext } from "../character/prompt-composer.js";
import { filterMemoryCandidates } from "../memory/guard.js";
import { extractFallbackSignals } from "./fallback-signals.js";
import { mapEmotionState } from "./emotion-mapper.js";
import { smoothEmotionState } from "./emotion-smoothing.js";
import { LlmGateway, type LlmMetrics } from "./llm-gateway.js";
import { chooseResponsePlan } from "./policy-router.js";
import { maxRisk, runHardRiskGuard } from "./risk-guard.js";
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
}

export interface OrchestratorResult {
  signals: RawSignals;
  rawState: EmotionState;
  state: EmotionState;
  riskLevel: RiskLevel;
  ruleCodes: string[];
  plan: ResponsePlan;
  nextSpiritTurnCount: number;
  nextCompanionLockTurns: number;
  reply: string;
  actionDraft: string | null;
  memoryCandidates: MemoryCandidate[];
  metrics: LlmMetrics[];
  signalSource: "cloud_model" | "local_fallback";
  responseSource: ResponseSource;
  characterVersion: string;
}

export class SupportOrchestrator {
  constructor(private readonly gateway: LlmGateway, private readonly env: AppEnv) {}

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const hardRisk = runHardRiskGuard(input.text);
    const analyzed = hardRisk.level === "high" || hardRisk.level === "imminent"
      ? null
      : await this.gateway.analyze(input.text);
    const signals = analyzed?.signals ?? extractFallbackSignals(input.text);
    if (hardRisk.level === "high" || hardRisk.level === "imminent") signals.modelRiskHint = hardRisk.level;
    const riskLevel = maxRisk(hardRisk.level, signals.modelRiskHint);
    const rawState = mapEmotionState(signals);
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
    });

    if (riskLevel === "high" || riskLevel === "imminent") {
      return {
        signals,
        rawState,
        state,
        riskLevel,
        ruleCodes: analyzed ? [...hardRisk.ruleCodes, "MODEL_HIGH_RISK"] : hardRisk.ruleCodes,
        plan: routed.plan,
        nextSpiritTurnCount: routed.nextSpiritTurnCount,
        nextCompanionLockTurns: routed.nextCompanionLockTurns,
        reply: highRiskResponse(riskLevel, this.env.RESEARCH_CONTACT),
        actionDraft: null,
        memoryCandidates: [],
        metrics: analyzed ? [analyzed.metrics] : [],
        signalSource: analyzed ? "cloud_model" : "local_fallback",
        responseSource: "static_safety",
        characterVersion: CHARACTER_VERSION,
      };
    }

    const prompt = composeCharacterPrompt({
      plan: routed.plan,
      state,
      memories: input.memories,
      ...(input.actionContext ? { actionContext: input.actionContext } : {}),
      recentContext: input.recentContext,
      userText: input.text,
    });
    const [generated, extracted] = await Promise.all([
      this.gateway.generate(prompt),
      this.gateway.extractMemories(input.text),
    ]);
    const fallback = fallbackReply(routed.plan, input.text);
    return {
      signals,
      rawState,
      state,
      riskLevel,
      ruleCodes: hardRisk.ruleCodes,
      plan: routed.plan,
      nextSpiritTurnCount: routed.nextSpiritTurnCount,
      nextCompanionLockTurns: routed.nextCompanionLockTurns,
      reply: generated?.reply ?? fallback.reply,
      actionDraft: routed.plan.allowActionDraft ? (generated?.actionDraft ?? fallback.actionDraft) : null,
      memoryCandidates: filterMemoryCandidates(extracted?.memories ?? [], input.text),
      metrics: [analyzed?.metrics, generated?.metrics, extracted?.metrics].filter((metric): metric is LlmMetrics => Boolean(metric)),
      signalSource: analyzed ? "cloud_model" : "local_fallback",
      responseSource: generated ? "cloud_model" : "local_fallback",
      characterVersion: CHARACTER_VERSION,
    };
  }
}
