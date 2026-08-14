import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

export function registerHealthRoute(app: FastifyInstance, db: PrismaClient): void {
  app.get("/api/health", async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
