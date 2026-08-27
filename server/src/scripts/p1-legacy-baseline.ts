import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegacyBaselineReport } from "../release/legacy-baseline.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const resultRoot = resolve(workspaceRoot, "test-results");
const read = (name: string): unknown => {
  const path = resolve(resultRoot, name);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
};
const report = buildLegacyBaselineReport(
  read("core-dialogue-eval-deterministic.json"),
  read("core-dialogue-eval-model.json"),
);
mkdirSync(resultRoot, { recursive: true });
writeFileSync(resolve(resultRoot, "p1-legacy-baseline.json"), JSON.stringify(report, null, 2), "utf8");
process.stdout.write(`P1_LEGACY_BASELINE ${report.status} sha=${report.source.gitCommit}\n`);
