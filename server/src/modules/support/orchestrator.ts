import type { EmotionState, RawSignals, ResponsePlan, RiskLevel, SurfaceMode } from "@otter/shared";
import type { AppEnv } from "../../config/env.js";
import { extractFallbackSignals } from "./fallback-signals.js";
import { mapEmotionState } from "./emotion-mapper.js";
import { LlmGateway, type LlmMetrics } from "./llm-gateway.js";
import { chooseResponsePlan } from "./policy-router.js";
import { maxRisk, runHardRiskGuard } from "./risk-guard.js";
import { fallbackReply, highRiskResponse } from "./static-responses.js";

export interface OrchestratorInput {
  text: string;
  intent: "auto" | "talk" | "organize";
  currentMode: SurfaceMode;
  transitionAccepted: boolean;
  recentContext: string[];
}

export interface OrchestratorResult {
  signals: RawSignals;
  state: EmotionState;
  riskLevel: RiskLevel;
  ruleCodes: string[];
  plan: ResponsePlan;
  reply: string;
  actionDraft: string | null;
  metrics: LlmMetrics[];
}

export class SupportOrchestrator {
  constructor(private readonly gateway: LlmGateway, private readonly env: AppEnv) {}

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const hardRisk = runHardRiskGuard(input.text);
    if (hardRisk.level === "high" || hardRisk.level === "imminent") {
      const signals = extractFallbackSignals(input.text);
      signals.modelRiskHint = hardRisk.level;
      const state = mapEmotionState(signals);
      const plan = chooseResponsePlan({ ...input, riskLevel: hardRisk.level, state, wasRecentlySupported: input.recentContext.some((item) => item.startsWith("assistant:")) });
      return {
        signals,
        state,
        riskLevel: hardRisk.level,
        ruleCodes: hardRisk.ruleCodes,
        plan,
        reply: highRiskResponse(hardRisk.level, this.env.RESEARCH_CONTACT),
        actionDraft: null,
        metrics: [],
      };
    }

    const analyzed = await this.gateway.analyze(input.text);
    const signals = analyzed?.signals ?? extractFallbackSignals(input.text);
    const riskLevel = maxRisk(hardRisk.level, signals.modelRiskHint);
    const state = mapEmotionState(signals);
    const plan = chooseResponsePlan({ ...input, riskLevel, state, wasRecentlySupported: input.recentContext.some((item) => item.startsWith("assistant:")) });

    if (riskLevel === "high" || riskLevel === "imminent") {
      return {
        signals,
        state,
        riskLevel,
        ruleCodes: [...hardRisk.ruleCodes, "MODEL_HIGH_RISK"],
        plan,
        reply: highRiskResponse(riskLevel, this.env.RESEARCH_CONTACT),
        actionDraft: null,
        metrics: analyzed ? [analyzed.metrics] : [],
      };
    }

    const generated = await this.gateway.generate(plan, input.recentContext, input.text);
    const fallback = fallbackReply(plan, input.text);
    return {
      signals,
      state,
      riskLevel,
      ruleCodes: hardRisk.ruleCodes,
      plan,
      reply: generated?.reply ?? fallback.reply,
      actionDraft: plan.allowActionDraft ? (generated?.actionDraft ?? fallback.actionDraft) : null,
      metrics: [analyzed?.metrics, generated?.metrics].filter((metric): metric is LlmMetrics => Boolean(metric)),
    };
  }
}
