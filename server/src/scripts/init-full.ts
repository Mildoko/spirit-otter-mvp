import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args: string[]): void {
  const result = spawnSync(npm, args, { cwd: new URL("../../../", import.meta.url), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function preflight(phase: "bootstrap" | "ready"): void {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./preflight.js", import.meta.url)), "--mode=full", `--phase=${phase}`], { cwd: new URL("../../../", import.meta.url), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

preflight("bootstrap");
run(["run", "db:generate"]);
run(["run", "db:deploy", "-w", "@otter/server"]);
run(["run", "db:seed", "-w", "@otter/server"]);
run(["run", "invites", "--", "5"]);
preflight("ready");
