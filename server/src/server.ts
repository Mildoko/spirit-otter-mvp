import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { prisma } from "./db/client.js";

const env = loadEnv();
const app = await buildApp(env);

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  await app.close();
  await prisma.$disconnect();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void shutdown().finally(() => process.exit(0)); });
}

try {
  await app.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
  app.log.info({ mode: env.OTTER_RUNTIME_MODE, port: env.SERVER_PORT }, env.OTTER_RUNTIME_MODE === "full" ? "完整模式已启动" : `${env.OTTER_RUNTIME_MODE} 模式已启动`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") app.log.error(`端口 ${env.SERVER_PORT} 已被占用；请停止旧服务或修改 SERVER_PORT`);
  throw error;
}
