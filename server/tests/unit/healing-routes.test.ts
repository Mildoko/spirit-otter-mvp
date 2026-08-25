import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/config/env.js";
import { DemoStore } from "../../src/demo/store.js";

describe("healing preferences and end-session API", () => {
  let app: FastifyInstance;
  let store: DemoStore;
  beforeEach(async () => {
    const env = loadEnv({ NODE_ENV: "test", OTTER_RUNTIME_MODE: "demo", DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "healing-route-secret-with-more-than-thirty-two-characters", LLM_API_KEY: "" });
    store = new DemoStore();
    app = await buildApp(env, undefined, { demoStore: store });
    await app.ready();
  });
  afterEach(async () => app.close());

  it("can disable deep interpretation and reset only the healing segment after optional feedback", async () => {
    const disabled = await app.inject({ method: "PATCH", url: "/api/me/experience-preferences", payload: { deepInterpretationEnabled: false } });
    expect(disabled.statusCode).toBe(200);
    expect(store.deepInterpretationEnabled).toBe(false);
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.healing.deepAnalysisEnabled).toBe(false);
    const oldSegment = store.guidanceState.schemaVersion === 4 ? store.guidanceState.healing.segmentId : "";
    const ended = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload: { feedback: { schemaVersion: 1, understanding: "partly", movement: "clearer" } } });
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toEqual({ ended: true });
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.healing).toMatchObject({ status: "inactive", deepAnalysisEnabled: false });
    expect(store.guidanceState.schemaVersion === 4 && store.guidanceState.healing.segmentId).not.toBe(oldSegment);
  });

  it("allows feedback to be skipped and rejects content-shaped extra fields", async () => {
    const requested = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/healing-feedback-requested`, payload: {} });
    expect(requested.statusCode).toBe(200);
    const segmentId = requested.json().segmentId as string;
    expect((await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload: { segmentId, skipped: true } })).statusCode).toBe(200);
    expect(store.exportConversationFeedbackRecords()).toMatchObject([{ segmentId, feedbackSchemaVersion: 2, skipped: true }]);
    expect((await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload: { skipped: true, userText: "不应记录" } })).statusCode).toBe(400);
  });

  it("stores v2 thumbs feedback with optional details and keeps retries idempotent", async () => {
    const requested = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/healing-feedback-requested`, payload: {} });
    const segmentId = requested.json().segmentId as string;
    const payload = { segmentId, feedback: { schemaVersion: 2, verdict: "not_helpful", understanding: "missed", movement: "unchanged", reason: "repetitive" } };
    const first = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload });
    const retry = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload });
    expect(first.json()).toEqual({ ended: true });
    expect(retry.json()).toEqual({ ended: true, duplicate: true });
    expect(store.exportConversationFeedbackRecords()).toMatchObject([{ segmentId, feedbackSchemaVersion: 2, verdict: "not_helpful", reason: "repetitive" }]);
    const changed = await app.inject({ method: "POST", url: `/api/conversations/${store.conversationId}/end`, payload: { ...payload, feedback: { ...payload.feedback, verdict: "helpful" } } });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe("STALE_FEEDBACK_SEGMENT");
  });
});
