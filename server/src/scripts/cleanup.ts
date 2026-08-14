import { prisma } from "../db/client.js";
import { cleanupExpiredData } from "../jobs/cleanup.js";

try {
  const result = await cleanupExpiredData(prisma);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}
