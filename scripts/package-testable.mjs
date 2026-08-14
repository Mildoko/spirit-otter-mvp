import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDir = join(root, "release");
const stageRoot = join(releaseDir, ".staging");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
let sha = "unknown";
let dirty = true;
try {
  sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().length > 0;
} catch {}

const packageName = `spirit-otter-testable-${manifest.version}-${sha}${dirty ? "-dirty" : ""}`;
const packageDir = join(stageRoot, packageName);
const archivePath = join(releaseDir, `${packageName}.tar.gz`);
const excludedNames = new Set([".git", "node_modules", "release", "test-results", "playwright-report", "coverage", ".cache", ".vite", ".turbo", "certs", "research-export"]);
const includedRoots = [".github", ".env.example", ".gitignore", "README.md", "package.json", "package-lock.json", "tsconfig.base.json", "docker-compose.yml", "docs", "infra", "packages", "server", "web", "scripts"];

function copyFiltered(source, target) {
  const name = basename(source);
  if (excludedNames.has(name)) return;
  if (name.startsWith(".env") && name !== ".env.example") return;
  if (/\.log$|\.tsbuildinfo$|\.sqlite3?$|\.db$|\.dump$|\.backup$/i.test(name)) return;
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) copyFiltered(join(source, entry), join(target, entry));
  } else if (stat.isFile()) {
    mkdirSync(resolve(target, ".."), { recursive: true });
    cpSync(source, target);
  }
}

mkdirSync(releaseDir, { recursive: true });
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
for (const entry of includedRoots) {
  const source = join(root, entry);
  if (existsSync(source)) copyFiltered(source, join(packageDir, entry));
}

const packageManifest = {
  name: packageName,
  createdAt: new Date().toISOString(),
  version: manifest.version,
  sourceCommit: sha,
  sourceDirty: dirty,
  runtime: { node: ">=22", postgres: "16+ for full mode", browser: "Chrome/Chromium" },
  included: ["prebuilt server/web/shared dist", "source and tests", "Prisma schema and migrations", "CI and E2E configuration", "Docker/Caddy configuration", "operations and pretest documents"],
  excluded: ["secrets and local env files", "node_modules", "database data and backups", "logs and test artifacts", "Git metadata"],
  validation: {
    packageGate: ["typecheck", "unit and acceptance tests", "Postgres integration tests", "production build", "desktop and mobile demo/full E2E", "real model comparison"],
    demo: ["npm ci", "npm run preflight:demo", "npm run dev:demo", "npm run test:e2e:demo"],
    full: ["configure .env.local", "npm run preflight:full", "npm run init:full", "npm run test:integration", "npm run test:model", "npm run report:acceptance"],
  },
  releaseBlockers: ["G26 user memory settings before external participants", "LAN CA/Cookie/network isolation", "encrypted backup/restore drill", "five-person internal pretest"],
};
writeFileSync(join(packageDir, "PACKAGE-MANIFEST.json"), JSON.stringify(packageManifest, null, 2), "utf8");
writeFileSync(join(packageDir, "TEST-PACKAGE-README.md"), `# 灵体水獭完整测试包\n\n此包包含预构建产物、源码、测试、迁移和交付文档，不包含密钥、node_modules 或数据库数据。\n\n## 演示模式\n\n1. \`npm ci\`\n2. \`npm run preflight:demo\`\n3. \`npm run dev:demo\`，打开 http://localhost:3001\n4. \`npm run test:e2e:demo\` 执行桌面与手机浏览器测试\n\n## 完整模式\n\n复制 .env.example 为 .env.local，配置 Postgres、SESSION_SECRET 和 LLM_API_KEY，然后运行：\n\n- \`npm run preflight:full\`\n- \`npm run init:full\`\n- \`npm run test:integration\`\n- \`npm run test:model\`\n- \`npm run report:acceptance\`\n\n完整发布仍需按 docs/operations-checklist.md 完成局域网与现场验收。\n`, "utf8");

rmSync(archivePath, { force: true });
const tar = spawnSync("tar", ["-czf", archivePath, "-C", stageRoot, packageName], { cwd: root, stdio: "inherit" });
if (tar.status !== 0) process.exit(tar.status ?? 1);
const digest = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
writeFileSync(`${archivePath}.sha256`, `${digest}  ${basename(archivePath)}\n`, "utf8");
rmSync(stageRoot, { recursive: true, force: true });
console.log(JSON.stringify({ archive: archivePath, sha256: digest, sourceDirty: dirty }));
