import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../server/dist/config/env.js";
import { LlmGateway } from "../server/dist/modules/support/llm-gateway.js";
import { SupportOrchestrator } from "../server/dist/modules/support/orchestrator.js";
import { CHARACTER_VERSION } from "../server/dist/modules/character/cards.js";
import { POLICY_VERSION, PROMPT_VERSION } from "../server/dist/config/constants.js";
import { resolveEvidenceProvenance } from "../server/dist/release/evidence-integrity.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceProvenance = resolveEvidenceProvenance(workspaceRoot);

export default class OtterOrchestratorProvider {
  constructor(options = {}) {
    this.providerId = options.id || "otter-orchestrator";
  }

  id() { return this.providerId; }

  async callApi(prompt, context = {}) {
    const sampleId = String(context.vars?.sampleId || "unknown");
    const offline = process.env.PROMPTFOO_OFFLINE !== "false";
    if (!offline && !String(process.env.LLM_API_KEY || "").trim()) return { error: "blocked: missing LLM_API_KEY" };
    const env = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused",
      SESSION_SECRET: "promptfoo-test-secret-that-is-longer-than-thirty-two-characters",
      COOKIE_SECURE: "false",
      OTTER_RUNTIME_MODE: "lab",
      LOCAL_TEST_MODE: "true",
      LLM_API_KEY: offline ? "" : process.env.LLM_API_KEY,
    });
    const orchestrator = new SupportOrchestrator(new LlmGateway(env), env, () => new Date("2026-08-27T00:00:00.000Z"), () => 0);
    const result = await orchestrator.run({
      text: prompt,
      currentSpirit: context.vars?.currentSpirit || "deep_tide",
      spiritTurnCount: Number(context.vars?.spiritTurnCount || 0),
      companionLockTurns: 0,
      recentContext: [],
      previousRawStates: [],
      memories: [],
      ...(context.vars?.actionContext ? { actionContext: context.vars.actionContext } : {}),
    });
    const tokenUsage = result.metrics.reduce((usage, metric) => ({
      prompt: usage.prompt + (metric.promptTokens || 0),
      completion: usage.completion + (metric.outputTokens || 0),
      total: usage.total + (metric.promptTokens || 0) + (metric.outputTokens || 0),
    }), { prompt: 0, completion: 0, total: 0 });
    return {
      output: JSON.stringify({
        sampleId,
        responseSource: result.responseSource,
        signalSource: result.signalSource,
        riskLevel: result.riskLevel,
        sceneState: result.plan.sceneState,
        primaryStrategy: result.plan.primaryStrategy,
        violationCodes: result.responseStyleDiagnostics?.violationCodes || [],
        actionDraft: result.actionDraft,
        reply: result.reply,
        promptVersion: result.responseStyleDiagnostics?.promptVersion || PROMPT_VERSION,
        policyVersion: POLICY_VERSION,
        characterVersion: CHARACTER_VERSION,
        gitCommit: evidenceProvenance.gitCommit,
        gitDirty: evidenceProvenance.gitDirty,
      }),
      tokenUsage,
      metadata: { sampleId, syntheticOrFrozen: true, responseSource: result.responseSource },
    };
  }
}
