import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBuildVersion(configured = "auto"): string {
  if (configured !== "auto") return configured;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return `${manifest.version}+${sha || "dev"}`;
  } catch { return `${manifest.version}+dev`; }
}
