import { describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { z } from "zod";
import { executeStructuredTransport, validateStructuredPayload } from "../../src/modules/support/structured-transport.js";
import { resolveStructuredOutputContract } from "../../src/modules/support/structured-output.js";

const base = {
  transport: "responses_json_schema" as const,
  provider: "deepseek",
  model: "deepseek-v4-flash",
  system: "synthetic system",
  user: "synthetic input",
  maxTokens: 100,
  jsonMode: true,
  contract: resolveStructuredOutputContract("generate"),
};
const client = (responsesCreate: (input?: unknown) => Promise<unknown>, chatCreate: (input?: unknown) => Promise<unknown> = async () => ({})) => ({
  responses: { create: responsesCreate },
  chat: { completions: { create: chatCreate } },
}) as unknown as OpenAI;

describe("structured transport", () => {
  it("normalizes Responses success and usage", async () => {
    const result = await executeStructuredTransport({ ...base, client: client(async () => ({
      status: "completed", output_text: '{"reply":"ok","actionDraft":null}', usage: { input_tokens: 12, output_tokens: 8 },
    })) });
    expect(result).toEqual({ data: '{"reply":"ok","actionDraft":null}', metrics: { promptTokens: 12, outputTokens: 8 }, failure: null });
  });

  it("normalizes rejection, empty output, timeout, and provider errors", async () => {
    const rejected = await executeStructuredTransport({ ...base, client: client(async () => ({ status: "failed", output_text: "", error: { code: "rejected" } })) });
    const empty = await executeStructuredTransport({ ...base, client: client(async () => ({ status: "completed", output_text: "", usage: {} })) });
    const timeout = await executeStructuredTransport({ ...base, client: client(async () => { throw new Error("request timed out"); }) });
    const provider = await executeStructuredTransport({ ...base, client: client(async () => { throw new Error("bad gateway"); }) });
    expect(rejected.failure).toEqual({ reason: "provider_error", detail: "rejected" });
    expect(empty.failure?.reason).toBe("empty_response");
    expect(timeout.failure?.reason).toBe("timeout");
    expect(provider.failure?.reason).toBe("provider_error");
  });

  it("normalizes legacy chat output and final JSON/Schema failures", async () => {
    const result = await executeStructuredTransport({
      ...base,
      transport: "legacy_json_object",
      client: client(async () => ({}), async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 2, completion_tokens: 1 } })),
    });
    expect(result.failure).toBeNull();
    expect(validateStructuredPayload("not-json", z.object({ ok: z.boolean() })).failure?.reason).toBe("invalid_json");
    expect(validateStructuredPayload('{"ok":"yes"}', z.object({ ok: z.boolean() })).failure?.reason).toBe("schema_error");
  });

  it("sends a strict JSON Schema through Chat Completions when selected", async () => {
    let request: unknown;
    const result = await executeStructuredTransport({
      ...base,
      transport: "chat_json_schema",
      client: client(async () => ({}), async (body) => {
        request = body;
        return { choices: [{ message: { content: '{"reply":"ok","actionDraft":null}' } }], usage: { prompt_tokens: 4, completion_tokens: 3 } };
      }),
    });
    expect(result.failure).toBeNull();
    expect(request).toMatchObject({ response_format: { type: "json_schema", json_schema: { name: base.contract.schemaId, strict: true } } });
  });
});
