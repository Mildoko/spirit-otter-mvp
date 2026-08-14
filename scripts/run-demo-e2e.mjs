import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
const env = {
  ...process.env,
  E2E_MODE: "demo",
  E2E_BASE_URL: "http://localhost:3101",
  SERVER_PORT: "3101",
  WEB_ORIGIN: "http://localhost:3101",
  LLM_API_KEY: "",
};
const result = npmCli
  ? spawnSync(process.execPath, [npmCli, "run", "test:e2e"], { stdio: "inherit", env })
  : spawnSync("npm", ["run", "test:e2e"], { stdio: "inherit", env, shell: process.platform === "win32" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
