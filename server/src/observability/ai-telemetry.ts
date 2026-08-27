import { SpanStatusCode, type Span } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { AppEnv } from "../config/env.js";

export interface AiModelCallStart {
  operation: string;
  provider: string;
  model: string;
  attempt: number;
  transport?: "legacy_json_object" | "responses_json_schema" | "chat_json_schema";
  schemaId?: string;
}

export interface AiModelCallResult {
  outcome: "success" | "failure";
  latencyMs: number;
  failureReason?: string;
  promptTokens?: number;
  outputTokens?: number;
}

export interface AiModelCallSpan {
  finish(result: AiModelCallResult): void;
}

export interface AiTelemetry {
  readonly enabled: boolean;
  startModelCall(input: AiModelCallStart): AiModelCallSpan;
  recordStateParity(input: {
    domain: "guidance" | "action" | "followup";
    engine: "shadow" | "new";
    outcome: "match" | "mismatch";
  }): void;
  shutdown(): Promise<void>;
}

export const AI_TRACE_ATTRIBUTE_KEYS = [
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.request.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
  "otter.attempt",
  "otter.capture_mode",
  "otter.failure_reason",
  "otter.latency_ms",
  "otter.outcome",
  "otter.operation",
  "otter.runtime_mode",
  "otter.transport",
  "otter.schema_id",
  "otter.state_domain",
  "otter.state_engine",
  "otter.parity_outcome",
] as const;

const noOpSpan: AiModelCallSpan = { finish: () => undefined };
export const noOpAiTelemetry: AiTelemetry = {
  enabled: false,
  startModelCall: () => noOpSpan,
  recordStateParity: () => undefined,
  shutdown: async () => undefined,
};

function finishSpan(span: Span, result: AiModelCallResult): void {
  span.setAttribute("otter.outcome", result.outcome);
  span.setAttribute("otter.latency_ms", result.latencyMs);
  if (result.failureReason) span.setAttribute("otter.failure_reason", result.failureReason);
  if (result.promptTokens !== undefined) span.setAttribute("gen_ai.usage.input_tokens", result.promptTokens);
  if (result.outputTokens !== undefined) span.setAttribute("gen_ai.usage.output_tokens", result.outputTokens);
  span.setStatus({ code: result.outcome === "success" ? SpanStatusCode.OK : SpanStatusCode.ERROR });
  span.end();
}

export function createAiTelemetry(env: AppEnv): AiTelemetry {
  if (!env.AI_OBSERVABILITY_ENABLED) return noOpAiTelemetry;

  const processor = new LangfuseSpanProcessor({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    environment: env.NODE_ENV,
    release: env.BUILD_VERSION,
    mediaUploadEnabled: false,
    shouldExportSpan: ({ otelSpan }) => otelSpan.name === "ai.model.call" || otelSpan.name === "ai.state.parity",
  });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "boonzoom-ai-gateway" }),
    spanProcessors: [processor],
  });
  provider.register();
  const tracer = provider.getTracer("boonzoom.ai", "1.0.0");

  return {
    enabled: true,
    startModelCall: (input) => {
      const span = tracer.startSpan("ai.model.call", {
        attributes: {
          "gen_ai.operation.name": "chat",
          "gen_ai.provider.name": input.provider,
          "gen_ai.request.model": input.model,
          "otter.attempt": input.attempt,
          "otter.capture_mode": "metadata_only",
          "otter.operation": input.operation,
          "otter.runtime_mode": env.OTTER_RUNTIME_MODE,
          ...(input.transport ? { "otter.transport": input.transport } : {}),
          ...(input.schemaId ? { "otter.schema_id": input.schemaId } : {}),
        },
      });
      let finished = false;
      return {
        finish: (result) => {
          if (finished) return;
          finished = true;
          finishSpan(span, result);
        },
      };
    },
    recordStateParity: (input) => {
      const span = tracer.startSpan("ai.state.parity", {
        attributes: {
          "otter.capture_mode": "metadata_only",
          "otter.runtime_mode": env.OTTER_RUNTIME_MODE,
          "otter.state_domain": input.domain,
          "otter.state_engine": input.engine,
          "otter.parity_outcome": input.outcome,
        },
      });
      span.setStatus({ code: input.outcome === "match" ? SpanStatusCode.OK : SpanStatusCode.ERROR });
      span.end();
    },
    shutdown: async () => provider.shutdown(),
  };
}
