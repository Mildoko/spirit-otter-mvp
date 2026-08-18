import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("TEST_DATABASE_URL is required for full-mode E2E.");
  process.exit(1);
}

const apiPort = process.env.E2E_API_PORT ?? "3201";
const webPort = process.env.E2E_WEB_PORT ?? "4174";
const baseURL = `http://127.0.0.1:${webPort}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  OTTER_RUNTIME_MODE: "full",
  LOCAL_TEST_MODE: "false",
  SERVER_HOST: "127.0.0.1",
  SERVER_PORT: apiPort,
  WEB_ORIGIN: baseURL,
  COOKIE_SECURE: "false",
  LLM_API_KEY: "",
  E2E_API_TARGET: apiURL,
  E2E_BASE_URL: baseURL,
};

function runNpm(args, overrides = {}) {
  const commandEnv = { ...env, ...overrides };
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd: root, env: commandEnv, stdio: "inherit" })
    : spawnSync("npm", args, { cwd: root, env: commandEnv, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitFor(url, child, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`${label} did not become ready: ${url}`);
}

function createInvite() {
  const result = spawnSync(process.execPath, ["server/dist/scripts/generate-invites.js", "1"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error("Failed to create an E2E invite.");
  }
  const invite = result.stdout.match(/OTTER-[A-F0-9]+/)?.[0];
  if (!invite) throw new Error("The invite generator did not return an invite code.");
  return invite;
}

runNpm(["run", "build"], { NODE_ENV: "production" });

const serverOutput = [];
const server = spawn(process.execPath, ["server/dist/server.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));
const web = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", webPort, "--strictPort", "--configLoader", "native"], {
  cwd: resolve(root, "web"),
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitFor(`${apiURL}/api/health`, server, "API server");
  await waitFor(baseURL, web, "web preview");
  for (const project of ["desktop-chrome", "mobile-chrome"]) {
    const invite = createInvite();
    const result = spawnSync(process.execPath, [resolve(root, "node_modules/@playwright/test/cli.js"), "test", "e2e/core-flow.e2e.ts", `--project=${project}`], {
      cwd: resolve(root, "web"),
      env: { ...env, E2E_INVITE_CODE: invite },
      stdio: "inherit",
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (serverOutput.length) console.error(serverOutput.join("").slice(-8000));
  process.exitCode = 1;
} finally {
  server.kill();
  web.kill();
}
