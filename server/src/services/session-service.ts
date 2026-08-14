import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AppEnv } from "../config/env.js";
import { SESSION_COOKIE } from "../config/constants.js";
import { hashSecret } from "../utils.js";

export interface AuthContext {
  sessionId: string;
  userId: string;
  researchId: string;
}

export async function getAuthContext(
  request: FastifyRequest,
  db: PrismaClient,
  env: AppEnv,
): Promise<AuthContext | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashSecret(token, env.SESSION_SECRET);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || session.user.expiresAt <= new Date()) return null;
  await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { sessionId: session.id, userId: session.userId, researchId: session.user.researchId };
}

export async function requireAuth(request: FastifyRequest, db: PrismaClient, env: AppEnv): Promise<AuthContext> {
  const auth = await getAuthContext(request, db, env);
  if (!auth) {
    const error = new Error("需要有效的匿名会话") as Error & { statusCode?: number; code?: string };
    error.statusCode = 401;
    error.code = "UNAUTHORIZED";
    throw error;
  }
  return auth;
}
