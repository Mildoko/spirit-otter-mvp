import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "../config/env.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";

type Check = { name: string; ok: boolean; detail: string };
const args = new Map(process.argv.slice(2).map((item) => { const [key, value = "true"] = item.replace(/^--/, "").split("="); return [key, value]; }));
const mode = args.get("mode") === "demo" ? "demo" : "full";
const phase = args.get("phase") === "bootstrap" ? "bootstrap" : "ready";
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

const nodeMajor = Number(process.versions.node.split(".")[0]);
add("Node.js", nodeMajor >= 22, nodeMajor >= 22 ? `v${process.versions.node}` : `需要 Node.js 22+，当前为 v${process.versions.node}`);

function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

if (mode === "demo") {
  add("运行模式", true, "demo：不需要数据库、邀请码或模型密钥");
  const available = await portAvailable(3001);
  add("服务端口 3001", available, available ? "端口可用" : "端口被占用；请停止旧服务或修改 SERVER_PORT");
} else {
  let env;
  try { env = loadEnv({ ...process.env, OTTER_RUNTIME_MODE: "full" }); add("环境配置", true, "完整模式配置有效"); }
  catch (error) { add("环境配置", false, error instanceof Error ? error.message : "配置无效"); }
  if (env) {
    const available = await portAvailable(env.SERVER_PORT);
    add(`服务端口 ${env.SERVER_PORT}`, available, available ? "端口可用" : "端口被占用；请停止旧服务或修改 SERVER_PORT");
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      await db.$queryRaw`SELECT 1`;
      add("Postgres", true, "数据库连接成功");
      if (phase === "ready") {
        const rows = await db.$queryRawUnsafe<Array<{ pending: bigint }>>('SELECT count(*) AS pending FROM "_prisma_migrations" WHERE "finished_at" IS NULL OR "rolled_back_at" IS NOT NULL');
        const pending = Number(rows[0]?.pending ?? 0);
        add("数据库迁移", pending === 0, pending === 0 ? "迁移状态正常" : `存在 ${pending} 条未完成或回滚迁移，请运行 npm run db:migrate`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知数据库错误";
      const detail = /authentication|password/i.test(message) ? "数据库认证失败，请检查 DATABASE_URL" : /does not exist/i.test(message) ? "数据库不存在，请先创建数据库" : "无法连接 Postgres，请确认服务已启动且 DATABASE_URL 正确";
      add("Postgres", false, detail);
    } finally { await db.$disconnect(); }
    if (!env.LLM_API_KEY) add("模型", false, "未配置 LLM_API_KEY；完整研究模式必须使用已验证模型");
    else {
      const probe = await new LlmGateway(env).probe();
      add("模型", probe.ok, probe.ok ? "模型 ID、JSON 输出和连通性验证成功" : `模型探测失败：${probe.reason}`);
    }
  }
}

for (const check of checks) console.log(`${check.ok ? "[通过]" : "[失败]"} ${check.name}：${check.detail}`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
