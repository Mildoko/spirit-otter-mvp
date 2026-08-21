import { randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { loadEnv } from "../config/env.js";
import { INVITE_CODE_DAYS } from "../config/constants.js";
import { addDays, hashSecret } from "../utils.js";

const env = loadEnv();
const countArg = Number.parseInt(process.argv[2] ?? "10", 10);
const count = Number.isFinite(countArg) ? Math.max(1, Math.min(100, countArg)) : 10;
const expiresAt = addDays(new Date(), INVITE_CODE_DAYS);
const codes: string[] = [];

try {
  for (let index = 0; index < count; index += 1) {
    const raw = `OTTER-${randomBytes(5).toString("hex").toUpperCase()}`;
    await prisma.inviteCode.create({
      data: { codeHash: hashSecret(raw, env.SESSION_SECRET), expiresAt },
    });
    codes.push(raw);
  }
  process.stdout.write(`以下邀请码只显示一次，有效期 ${INVITE_CODE_DAYS} 天，请安全交给研究参与者：\n${codes.join("\n")}\n`);
} finally {
  await prisma.$disconnect();
}
