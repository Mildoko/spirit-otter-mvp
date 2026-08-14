import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webDir = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(webDir, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const apiTarget = process.env.E2E_API_TARGET ?? "http://localhost:3001";
let sha = "dev";
try { sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "dev"; } catch {}

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_VERSION__: JSON.stringify(`${manifest.version}+${sha}`) },
  server: { proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
  preview: { proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
});
