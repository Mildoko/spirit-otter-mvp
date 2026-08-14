import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { prisma } from "./db/client.js";

const env = loadEnv();
const app = await buildApp(env);

const shutdown = async (): Promise<void> => {
  await app.close();
  await prisma.$disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
