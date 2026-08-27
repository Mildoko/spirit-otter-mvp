import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AiModelCallResult, AiModelCallStart, AiTelemetry } from "../observability/ai-telemetry.js";
import { loadEnv } from "../config/env.js";
import { LlmGateway, type LlmOperation } from "../modules/support/llm-gateway.js";
import { resolveEvidenceProvenance } from "../release/evidence-integrity.js";

interface TraceRow extends AiModelCallStart { result?: AiModelCallResult }
function collector(rows: TraceRow[]): AiTelemetry {
  return {
    enabled: true,
    startModelCall(input) {
      const row: TraceRow = { ...input };
      rows.push(row);
      return { finish: (result) => { row.result = result; } };
    },
    recordStateParity: () => undefined,
    shutdown: async () => undefined,
  };
}

async function runSyntheticSuite(gateway: LlmGateway): Promise<Partial<Record<LlmOperation, boolean>>> {
  const prompt = { system: "返回符合 Schema 的简体中文支持回复。", user: JSON.stringify({ currentUserText: "这是合成测试：我想先说清楚再决定。" }) };
  const brief = { schemaVersion: 1 as const, status: "active" as const, goal: "felt_seen" as const, depth: "recognize" as const, insight: null, rupture: "none" as const, realityPressure: "none" as const, allowedMoves: [], forbiddenMoves: [], replyOutline: [] };
  return {
    analyze: Boolean(await gateway.analyze("这是合成测试：我想先说清楚再决定。", false, [])),
    generate: Boolean(await gateway.generate(prompt)),
    repair: Boolean(await gateway.repairGeneratedReply(prompt, { reply: "我会一直陪你。", actionDraft: null }, ["DEPENDENCY_LANGUAGE"])),
    critique_healing: Boolean(await gateway.critiqueHealing({ userText: "这是合成测试文本。", reply: "我听见了这件事的具体重量。", brief })),
    extract_memories: Boolean(await gateway.extractMemories("这是合成测试：我明确偏好一次只问一个问题。", [])),
  };
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const base = loadEnv();
const provenance = resolveEvidenceProvenance(workspaceRoot);
const modes = ["legacy", "new"] as const;
const lanes = [];
const configured = Boolean(base.LLM_API_KEY.trim());
const structuredRows: TraceRow[] = [];
const structuredGateway = configured ? new LlmGateway(loadEnv({ ...process.env, LLM_STRUCTURED_OUTPUT_MODE: "new" }), collector(structuredRows)) : null;
const capability = configured
  ? await structuredGateway!.probeStructuredOutput()
  : { status: "unsupported" as const, reason: "missing_llm_api_key", transport: null, usageMetadata: false };
if (capability.status === "supported") {
  for (const mode of modes) {
    const rows: TraceRow[] = mode === "new" ? structuredRows : [];
    const env = loadEnv({ ...process.env, LLM_STRUCTURED_OUTPUT_MODE: mode });
    const gateway = mode === "new" ? structuredGateway! : new LlmGateway(env, collector(rows));
    const success = await runSyntheticSuite(gateway);
    const operations = (["analyze", "generate", "repair", "critique_healing", "extract_memories"] as const).map((operation) => {
      const calls = rows.filter((row) => row.operation === operation);
      const last = calls.at(-1);
      return {
        operation,
        success: success[operation] ?? false,
        attempts: calls.length,
        schemaErrors: calls.filter((row) => row.result?.failureReason === "schema_error").length,
        invalidJson: calls.filter((row) => row.result?.failureReason === "invalid_json").length,
        fallback: !(success[operation] ?? false),
        latencyMs: calls.reduce((sum, row) => sum + (row.result?.latencyMs ?? 0), 0),
        promptTokens: calls.reduce((sum, row) => sum + (row.result?.promptTokens ?? 0), 0),
        outputTokens: calls.reduce((sum, row) => sum + (row.result?.outputTokens ?? 0), 0),
        failure: last?.result?.failureReason ?? null,
      };
    });
    lanes.push({ mode, transport: mode === "new" ? capability.transport : "legacy_json_object", operations });
  }
}
const status = !configured ? "blocked" : capability.status === "unsupported" ? "blocked_unsupported"
  : capability.status === "invalid" ? "blocked" : lanes.every((lane) => lane.operations.every((operation) => operation.success)) ? "passed" : "failed";
const report = {
  schemaVersion: "structured-output-ab-v1",
  provenance,
  provider: base.LLM_PROVIDER,
  model: base.LLM_MODEL,
  syntheticOnly: true,
  status,
  capability,
  blockedReason: status === "passed" || status === "failed" ? null : capability.reason,
  lanes,
};
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "structured-output-ab.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`STRUCTURED_OUTPUT_AB ${report.status}${report.blockedReason ? ` reason=${report.blockedReason}` : ""}\n`);
if (report.status === "failed") process.exitCode = 1;
