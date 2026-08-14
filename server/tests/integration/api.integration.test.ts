import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, type AppEnv } from "../../src/config/env.js";
import { hashSecret } from "../../src/utils.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!testDatabaseUrl);
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
      payload: { conversationId, text: "今天很累，想先说说。", intent: "talk" },
    };
    const first = await app.inject(request);
    const repeated = await app.inject(request);
    expect(first.statusCode).toBe(200);
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().turnId).toBe(first.json().turnId);
    expect(await db.turn.count()).toBe(1);
    expect(await db.message.count()).toBe(2);
  });

  it("cascades user deletion into conversations and behavior events", async () => {
    const cookie = await redeem();
    const response = await app.inject({ method: "DELETE", url: "/api/me/data", headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(response.statusCode).toBe(204);
    expect(await db.anonymousUser.count()).toBe(0);
    expect(await db.conversation.count()).toBe(0);
    expect(await db.behaviorEvent.count()).toBe(0);
  });
});
