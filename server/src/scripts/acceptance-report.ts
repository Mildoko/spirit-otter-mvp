import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const npmCli = process.env.npm_execpath;
interface Result { name: string; status: "passed" | "failed" | "blocked"; detail: string }
const results: Result[] = [];

function run(name: string, args: string[], requiredEnv?: string): void {
  if (requiredEnv && !process.env[requiredEnv]) {
    results.push({ name, status: "blocked", detail: `缺少 ${requiredEnv}，未执行` });
    return;
  }
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: "inherit", env: process.env })
    : spawnSync("npm", args, { cwd: root, stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  const detail = result.error ? result.error.message : `退出码 ${result.status ?? "unknown"}`;
  results.push({ name, status: result.status === 0 ? "passed" : "failed", detail });
}

run("类型检查", ["run", "typecheck"]);
run("单元与内容验收", ["test"]);
run("构建", ["run", "build"]);
run("Postgres 集成测试", ["run", "test:integration"], "TEST_DATABASE_URL");
run("演示模式 E2E", ["run", "test:e2e:demo"]);
run("完整模式 E2E", ["run", "test:e2e:full"], "TEST_DATABASE_URL");
run("真实模型对照", ["run", "test:model"]);
run("DeepSeek 低信号报告", ["run", "test:model:low-signal"]);
run("DeepSeek 表达风格报告", ["run", "test:model:expression"]);

const overall = results.every((result) => result.status === "passed") ? "通过" : "未通过";
const report = `# tata 验收报告\n\n- 时间：${new Date().toISOString()}\n- 总体状态：**${overall}**\n- Node：${process.version}\n\n| 项目 | 状态 | 说明 |\n| --- | --- | --- |\n${results.map((result) => `| ${result.name} | ${result.status} | ${result.detail} |`).join("\n")}\n\n> 任一核心项目失败或 blocked 时，总体状态不得写为通过。\n`;
const outputDir = resolve(root, "test-results");
mkdirSync(outputDir, { recursive: true });
const output = resolve(outputDir, "acceptance-report.md");
writeFileSync(output, report, "utf8");
console.log(`验收报告已写入 ${output}`);
if (overall !== "通过") process.exitCode = 1;
