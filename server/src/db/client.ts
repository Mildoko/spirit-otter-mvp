import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __otterPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.__otterPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__otterPrisma = prisma;
