import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, type AppEnv } from "../../src/config/env.js";
import { hashSecret } from "../../src/utils.js";
import { persistMemoryCandidates, persistMemoryGraph, recallMemories } from "../../src/modules/memory/repository.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
if (!testDatabaseUrl && process.env.npm_lifecycle_event === "test:integration") {
  describe("Postgres integration environment", () => {
    it("requires TEST_DATABASE_URL", () => {
      expect(testDatabaseUrl, "TEST_DATABASE_URL is required; integration tests must not be reported as skipped").toBeTruthy();
    });
  });
}
const secret = "integration-test-secret-with-more-than-thirty-two-characters";
const inviteCode = "OTTER-INTEGRATION";

integration("Postgres API integration", () => {
  let db: PrismaClient;
  let app: FastifyInstance;
  let env: AppEnv;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.SESSION_SECRET = secret;
    env = loadEnv({
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: secret,
      COOKIE_SECURE: "false",
      WEB_ORIGIN: "http://localhost:5173",
      LLM_API_KEY: "",
      LOCAL_TEST_MODE: "false",
      OTTER_RUNTIME_MODE: "full",
      AUDIO_V1: "true",
      MEMORY_V2: "true",
    });
    db = new PrismaClient({ datasourceUrl: testDatabaseUrl });
    const { buildApp } = await import("../../src/app.js");
    app = await buildApp(env, db);
    await app.ready();
  });

  beforeEach(async () => {
    await db.anonymousUser.deleteMany();
    await db.inviteCode.deleteMany();
    await db.inviteCode.create({
      data: {
        codeHash: hashSecret(inviteCode, secret),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  async function redeem(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/redeem-invite",
      headers: { origin: env.WEB_ORIGIN },
      payload: {
        inviteCode,
        adultConfirmed: true,
        aiDisclosureAccepted: true,
        cloudProcessingAccepted: true,
        dataConsentAccepted: true,
      },
    });
    expect(response.statusCode).toBe(201);
    const cookie = response.headers["set-cookie"];
    expect(cookie).toBeTruthy();
    return String(cookie).split(";")[0] ?? "";
  }

  it("redeems once, restores bootstrap, and logs out", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().messages).toEqual([]);

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie, origin: env.WEB_ORIGIN }, payload: {} });
    expect(logout.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("returns the first result for a repeated idempotency key", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const request = {
      method: "POST" as const,
      url: "/api/chat/turn",
      headers: { cookie, origin: env.WEB_ORIGIN, "idempotency-key": "same-key" },
      payload: { conversationId, text: "今天很累，想先说说。" },
    };
    const first = await app.inject(request);
    const repeated = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(first.json().audioCue).toMatchObject({ schemaVersion: 1, agentId: "spirit_otter" });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().turnId).toBe(first.json().turnId);
    expect(await db.turn.count()).toBe(1);
    expect(await db.message.count()).toBe(2);
    const storedTurn = await db.turn.findFirstOrThrow();
    expect(storedTurn.resultJson).toMatchObject({ audioCue: { schemaVersion: 1, agentId: "spirit_otter" } });
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect((conversation.guidanceStateJson as { turnIndex?: number } | null)?.turnIndex).toBe(1);
    const supportEvent = await db.supportEvent.findFirstOrThrow();
    expect(supportEvent.signalFeaturesJson).toMatchObject({ expressionClarityScore: expect.any(Number), progressReadinessScore: expect.any(Number) });
    expect(supportEvent.responseStyleJson).toBeTruthy();
  });

  it("cascades user deletion into conversations and behavior events", async () => {
    const cookie = await redeem();
    const response = await app.inject({ method: "DELETE", url: "/api/me/data", headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(response.statusCode).toBe(204);
    expect(await db.anonymousUser.count()).toBe(0);
    expect(await db.conversation.count()).toBe(0);
    expect(await db.behaviorEvent.count()).toBe(0);
  });

  it("persists automatic spirit routing, one action, followup, export and refresh", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const invite = await app.inject({
      method: "POST", url: "/api/chat/turn",
      headers: { cookie, origin: env.WEB_ORIGIN, "idempotency-key": "organize-invite" },
      payload: { conversationId, text: "事情太多，请帮我整理。" },
    });
    expect(invite.statusCode).toBe(200);
    expect(invite.json()).not.toHaveProperty("modeTransition");
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).activeSpirit).toBe("shore_pick");

    const organized = await app.inject({
      method: "POST", url: "/api/chat/turn",
      headers: { cookie, origin: env.WEB_ORIGIN, "idempotency-key": "organize-action" },
      payload: { conversationId, text: "先写明天汇报的标题。" },
    });
    expect(organized.statusCode).toBe(200);
    const actionId = organized.json().action.id as string;
    const confirmed = await app.inject({ method: "POST", url: `/api/actions/${actionId}/confirm`, headers: { cookie, origin: env.WEB_ORIGIN }, payload: { decision: "confirm", text: "写出汇报标题" } });
    expect(confirmed.json().status).toBe("confirmed");

    const followup = await app.inject({ method: "POST", url: "/api/followups", headers: { cookie, origin: env.WEB_ORIGIN }, payload: { actionId, dueAt: new Date(Date.now() + 60_000).toISOString(), authorized: true } });
    expect(followup.statusCode).toBe(201);
    const restored = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    expect(restored.json().conversation).not.toHaveProperty("mode");
    expect(restored.json().messages).toHaveLength(4);
    expect(restored.json().actions[0].text).toBe("写出汇报标题");
    const exported = await app.inject({ method: "GET", url: "/api/me/export", headers: { cookie } });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().conversations[0].actions).toHaveLength(1);
  });

  it("allows only one concurrent turn and releases the conversation lock", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const make = (key: string) => app.inject({
      method: "POST", url: "/api/chat/turn",
      headers: { cookie, origin: env.WEB_ORIGIN, "idempotency-key": key },
      payload: { conversationId, text: "今天很累，想先说说。" },
    });
    const responses = await Promise.all([make("concurrent-one"), make("concurrent-two")]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).processingTurnId).toBeNull();
    expect((await make("after-concurrency")).statusCode).toBe(200);
  });

  it("marks a failed turn and releases the lock after an orchestrator failure", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const { buildApp } = await import("../../src/app.js");
    const failingApp = await buildApp(env, db, { orchestrator: { run: async () => { throw new Error("injected model failure"); } } });
    await failingApp.ready();
    const failed = await failingApp.inject({
      method: "POST", url: "/api/chat/turn",
      headers: { cookie, origin: env.WEB_ORIGIN, "idempotency-key": "forced-failure" },
      payload: { conversationId, text: "触发失败测试" },
    });
    expect(failed.statusCode).toBe(500);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).processingTurnId).toBeNull();
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).guidanceStateJson).toBeNull();
    expect((await db.turn.findFirstOrThrow({ where: { idempotencyKey: "forced-failure" } })).status).toBe("failed");
    await failingApp.close();
  });

  it("recalls only active unexpired memory and exports then cascades it", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const user = await db.anonymousUser.findFirstOrThrow();
    const turn = await db.turn.create({
      data: { conversationId, idempotencyKey: "memory-evidence", status: "completed", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const message = await db.message.create({
      data: { conversationId, turnId: turn.id, role: "user", content: "我更喜欢一次只问一个问题", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    await persistMemoryCandidates(db, {
      userId: user.id,
      conversationId,
      messageId: message.id,
      userText: message.content,
      candidates: [{
        kind: "user_preference",
        content: "更喜欢一次只问一个问题",
        structuredKey: "conversation.question_count",
        structuredValue: "one",
        origin: "user_explicit",
        sensitivity: "normal",
        importance: 0.9,
        confidence: 0.95,
        evidence: "我更喜欢一次只问一个问题",
      }],
    });
    expect((await recallMemories(db, user.id, "一次问几个问题"))).toHaveLength(1);
    await persistMemoryCandidates(db, {
      userId: user.id,
      conversationId,
      messageId: message.id,
      userText: "我现在更喜欢你先复述，再只问一个问题",
      candidates: [{
        kind: "user_preference",
        content: "更喜欢先复述，再只问一个问题",
        structuredKey: "conversation.question_count",
        structuredValue: "reflect_then_one",
        origin: "user_explicit",
        sensitivity: "normal",
        importance: 0.9,
        confidence: 0.95,
        evidence: "更喜欢你先复述，再只问一个问题",
      }],
    });
    expect(await db.memoryItem.count({ where: { userId: user.id, status: "active" } })).toBe(1);
    expect(await db.memoryItem.count({ where: { userId: user.id, status: "superseded" } })).toBe(1);
    expect(await db.memoryRevision.count()).toBe(1);
    expect((await recallMemories(db, user.id, "先复述再提问"))[0]?.content).toContain("先复述");
    await db.memoryItem.updateMany({ where: { status: "active" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await recallMemories(db, user.id, "一次问几个问题"))).toHaveLength(0);
    await db.memoryItem.updateMany({ where: { status: "superseded" }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });
    const exported = await app.inject({ method: "GET", url: "/api/me/export", headers: { cookie } });
    expect(exported.json().memories[0].type).toBe("user_preference");
    await app.inject({ method: "DELETE", url: "/api/me/data", headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(await db.memoryItem.count()).toBe(0);
    expect(await db.memoryEvidence.count()).toBe(0);
  });

  it("isolates recalled memories between users", async () => {
    await redeem();
    const first = await db.anonymousUser.findFirstOrThrow();
    const now = new Date();
    const second = await db.anonymousUser.create({
      data: {
        researchId: `SECOND-${Date.now()}`,
        adultConfirmedAt: now,
        aiDisclosureAcceptedAt: now,
        cloudProcessingAcceptedAt: now,
        dataConsentAcceptedAt: now,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const conversation = await db.conversation.create({ data: { userId: second.id } });
    const turn = await db.turn.create({ data: { conversationId: conversation.id, idempotencyKey: "second-memory", status: "completed", expiresAt: new Date(Date.now() + 86_400_000) } });
    const message = await db.message.create({ data: { conversationId: conversation.id, turnId: turn.id, role: "user", content: "我喜欢先看日历", expiresAt: new Date(Date.now() + 86_400_000) } });
    await persistMemoryCandidates(db, {
      userId: second.id,
      conversationId: conversation.id,
      messageId: message.id,
      userText: message.content,
      candidates: [{ kind: "user_preference", content: "喜欢先看日历", structuredKey: "planning.first_step", origin: "user_explicit", sensitivity: "normal", importance: 0.8, confidence: 0.9, evidence: "我喜欢先看日历" }],
    });
    expect(await recallMemories(db, first.id, "日历")).toEqual([]);
    expect(await recallMemories(db, second.id, "日历")).toHaveLength(1);
  });

  it("persists, manages and physically deletes a trusted memory graph", async () => {
    const cookie = await redeem();
    const bootstrap = await app.inject({ method: "GET", url: "/api/session/bootstrap", headers: { cookie } });
    const conversationId = bootstrap.json().conversation.id as string;
    const user = await db.anonymousUser.findFirstOrThrow();
    const turn = await db.turn.create({ data: { conversationId, idempotencyKey: "memory-v2", status: "completed", expiresAt: new Date(Date.now() + 86_400_000) } });
    const text = "主管表达很直接，明天和主管开会时我可能会紧张";
    const message = await db.message.create({ data: { conversationId, turnId: turn.id, role: "user", content: text, expiresAt: new Date(Date.now() + 86_400_000) } });
    const saved = await persistMemoryGraph(db, {
      userId: user.id, conversationId, messageId: message.id, userText: text, memoryV2Enabled: true,
      candidates: [
        { kind: "user_fact", content: "主管表达很直接", structuredKey: "person.manager", origin: "user_explicit", sensitivity: "normal", importance: 0.9, confidence: 0.95, evidence: "主管表达很直接" },
        { kind: "episode", content: "明天和主管开会时可能紧张", structuredKey: "event.manager_meeting", origin: "model_inference", sensitivity: "normal", importance: 0.9, confidence: 0.95, evidence: "明天和主管开会时我可能会紧张", eventTimeText: "明天" },
      ],
      relations: [{ sourceKey: "event.manager_meeting", targetKey: "person.manager", type: "may_trigger", origin: "model_inference", confidence: 0.95, evidence: "和主管开会时我可能会紧张" }],
    });
    expect(saved).toMatchObject({ memoryIds: [expect.any(String), expect.any(String)], relationIds: [expect.any(String)] });
    const listed = await app.inject({ method: "GET", url: "/api/me/memories", headers: { cookie } });
    expect(listed.json().items).toHaveLength(2);
    const hypothesis = listed.json().items.find((item: { claimState: string }) => item.claimState === "hypothesis");
    expect(hypothesis.eventAt).toBeTruthy();
    expect((await app.inject({ method: "PATCH", url: `/api/me/memories/${hypothesis.id}`, headers: { cookie, origin: env.WEB_ORIGIN }, payload: { action: "confirm" } })).json().claimState).toBe("confirmed");
    expect((await app.inject({ method: "PATCH", url: `/api/me/memory-relations/${saved.relationIds[0]}`, headers: { cookie, origin: env.WEB_ORIGIN }, payload: { action: "reject" } })).json().status).toBe("rejected");
    const corrected = await app.inject({ method: "PATCH", url: `/api/me/memories/${hypothesis.id}`, headers: { cookie, origin: env.WEB_ORIGIN }, payload: { action: "correct", content: "后天和主管开会" } });
    expect(corrected.json()).toMatchObject({ content: "后天和主管开会", claimState: "confirmed" });
    expect((await app.inject({ method: "DELETE", url: `/api/me/memories/${corrected.json().id}`, headers: { cookie, origin: env.WEB_ORIGIN } })).statusCode).toBe(204);
    expect(await db.memoryItem.findUnique({ where: { id: corrected.json().id } })).toBeNull();
  });
});
