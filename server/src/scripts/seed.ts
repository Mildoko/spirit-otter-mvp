import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { loadEnv } from "../config/env.js";
import { addDays, hashSecret } from "../utils.js";

const env = loadEnv();
const codes: string[] = [];
try {
  for (let index = 0; index < 5; index += 1) {
    const raw = `DEMO-${randomBytes(4).toString("hex").toUpperCase()}`;
    await prisma.inviteCode.create({ data: { codeHash: hashSecret(raw, env.SESSION_SECRET), expiresAt: addDays(new Date(), 7) } });
    codes.push(raw);
  }
  process.stdout.write(`演示邀请码：\n${codes.join("\n")}\n`);
} finally {
  await prisma.$disconnect();
}
