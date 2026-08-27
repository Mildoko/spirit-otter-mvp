import type OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { LlmFailureDiagnostic, LlmFailureReason, StructuredOutputTransport } from "./llm-gateway.js";
import type { StructuredOutputContract } from "./structured-output.js";

export interface StructuredTransportMetrics {
  promptTokens?: number;
  outputTokens?: number;
}

export interface StructuredTransportResult {
  data: string | null;
  metrics: StructuredTransportMetrics;
  failure: LlmFailureDiagnostic | null;
}

export interface StructuredPayloadResult<T> {
  data: T | null;
  failure: LlmFailureDiagnostic | null;
}

export function validateStructuredPayload<T>(
  content: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error?: { issues?: Array<{ path: PropertyKey[]; message: string }> } } },
): StructuredPayloadResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { data: null, failure: { reason: "invalid_json", detail: null } };
  }
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    const detail = validated.error?.issues?.slice(0, 4).map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ") ?? null;
    return { data: null, failure: { reason: "schema_error", detail } };
  }
  return { data: validated.data, failure: null };
}

function failureFor(error: unknown): LlmFailureDiagnostic {
  const message = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : "";
  const reason: LlmFailureReason = message.includes("timeout") || message.includes("timed out") || message.includes("abort") ? "timeout" : "provider_error";
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[a-z0-9_.-]{1,48}$/iu.test(error.code) ? error.code : null;
  return { reason, detail: status === null && code === null ? null : [status === null ? null : `http_${status}`, code].filter(Boolean).join(":") };
}

export async function executeStructuredTransport(input: {
  client: OpenAI;
  transport: StructuredOutputTransport;
  provider: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  jsonMode: boolean;
  contract: StructuredOutputContract;
}): Promise<StructuredTransportResult> {
  try {
    if (input.transport === "responses_json_schema") {
      const responseRequest = {
        model: input.model,
        instructions: input.system,
        input: input.user,
        text: { format: { type: "json_schema" as const, name: input.contract.schemaId, schema: input.contract.jsonSchema, strict: true } },
        temperature: 0.2,
        max_output_tokens: input.maxTokens,
      };
      if (input.provider.toLowerCase() === "deepseek") Object.assign(responseRequest, { reasoning: { effort: "none" } });
      const response = await input.client.responses.create(responseRequest);
      if (response.status === "failed") {
        return { data: null, metrics: {}, failure: { reason: "provider_error", detail: response.error?.code ?? null } };
      }
      if (!response.output_text) return { data: null, metrics: {}, failure: { reason: "empty_response", detail: response.status ?? null } };
      return {
        data: response.output_text,
        metrics: {
          ...(response.usage?.input_tokens !== undefined ? { promptTokens: response.usage.input_tokens } : {}),
          ...(response.usage?.output_tokens !== undefined ? { outputTokens: response.usage.output_tokens } : {}),
        },
        failure: null,
      };
    }

    if (input.transport === "chat_json_schema") {
      const requestBody = {
        model: input.model,
        messages: [{ role: "system" as const, content: input.system }, { role: "user" as const, content: input.user }],
        response_format: {
          type: "json_schema" as const,
          json_schema: { name: input.contract.schemaId, schema: input.contract.jsonSchema, strict: true },
        },
        temperature: 0.2,
        max_tokens: input.maxTokens,
      };
      if (input.provider.toLowerCase() === "deepseek") Object.assign(requestBody, { thinking: { type: "disabled" } });
      const response = await input.client.chat.completions.create(requestBody);
      const content = response.choices[0]?.message.content;
      if (!content) return { data: null, metrics: {}, failure: { reason: "empty_response", detail: null } };
      return {
        data: content,
        metrics: {
          ...(response.usage?.prompt_tokens !== undefined ? { promptTokens: response.usage.prompt_tokens } : {}),
          ...(response.usage?.completion_tokens !== undefined ? { outputTokens: response.usage.completion_tokens } : {}),
        },
        failure: null,
      };
    }

    const requestBody: ChatCompletionCreateParamsNonStreaming & { thinking?: { type: "disabled" } } = {
      model: input.model,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
      ...(input.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      temperature: 0.2,
      max_tokens: input.maxTokens,
    };
    if (input.provider.toLowerCase() === "deepseek") Object.assign(requestBody, { thinking: { type: "disabled" } });
    const response = await input.client.chat.completions.create(requestBody);
    const content = response.choices[0]?.message.content;
    if (!content) return { data: null, metrics: {}, failure: { reason: "empty_response", detail: null } };
    return {
      data: content,
      metrics: {
        ...(response.usage?.prompt_tokens !== undefined ? { promptTokens: response.usage.prompt_tokens } : {}),
        ...(response.usage?.completion_tokens !== undefined ? { outputTokens: response.usage.completion_tokens } : {}),
      },
      failure: null,
    };
  } catch (error) {
    return { data: null, metrics: {}, failure: failureFor(error) };
  }
}
