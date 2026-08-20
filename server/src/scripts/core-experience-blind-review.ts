import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCoreExperienceBlindReview, renderBlindReviewMarkdown } from "../reviews/core-experience-blind-review.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const value = (name: string) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3)
  ?? process.env[`npm_config_${name.replaceAll("-", "_")}`];
const baselinePath = value("baseline");
const candidatePath = value("candidate");
if (!baselinePath || !candidatePath) throw new Error("需要 --baseline=<Eval JSON> 和 --candidate=<Eval JSON>");
const baseline = JSON.parse(readFileSync(resolve(workspaceRoot, baselinePath), "utf8"));
const candidate = JSON.parse(readFileSync(resolve(workspaceRoot, candidatePath), "utf8"));
const result = createCoreExperienceBlindReview({ baseline, candidate, seed: value("seed") ?? "experience-v1" });
const outputDirectory = resolve(workspaceRoot, "test-results");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "core-experience-blind-review.json"), JSON.stringify(result.packet, null, 2), "utf8");
writeFileSync(resolve(outputDirectory, "core-experience-blind-review.md"), renderBlindReviewMarkdown(result.packet), "utf8");
writeFileSync(resolve(outputDirectory, "core-experience-blind-review-answer-key.json"), JSON.stringify(result.answerKey, null, 2), "utf8");
process.stdout.write(`CORE_EXPERIENCE_BLIND_REVIEW generated cases=${result.packet.entries.length}\n`);
