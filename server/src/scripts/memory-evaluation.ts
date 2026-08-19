import { loadEnv } from "../config/env.js";
import { memoryEvaluationCases } from "../modules/memory/evaluation-cases.js";
import { filterMemoryCandidates, filterMemoryRelationCandidates } from "../modules/memory/guard.js";
import { LlmGateway } from "../modules/support/llm-gateway.js";

if (memoryEvaluationCases.length !== 100) throw new Error(`记忆评测集应为 100 条，当前为 ${memoryEvaluationCases.length}`);
if (!process.argv.includes("--model")) {
  const categories = memoryEvaluationCases.reduce<Record<string, number>>((result, item) => ({ ...result, [item.category]: (result[item.category] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ total: memoryEvaluationCases.length, categories }, null, 2));
  process.exit(0);
}
const gateway = new LlmGateway(loadEnv());
if (!gateway.isConfigured) throw new Error("模型记忆评测需要 LLM_API_KEY");
let expectedPositive = 0; let acceptedPositive = 0; let falsePositive = 0; let expectedRelations = 0; let matchedRelations = 0;
for (const item of memoryEvaluationCases) {
  const result = await gateway.extractMemories(item.text);
  const memories = filterMemoryCandidates(result?.memories ?? [], item.text);
  const relations = filterMemoryRelationCandidates(result?.relations ?? [], item.text);
  if (item.shouldRemember) { expectedPositive += 1; if (!item.expectedKind || memories.some((memory) => memory.kind === item.expectedKind)) acceptedPositive += 1; }
  else if (memories.length || relations.length) falsePositive += 1;
  if (item.expectedRelation) { expectedRelations += 1; if (relations.some((relation) => relation.type === item.expectedRelation)) matchedRelations += 1; }
}
const report = {
  total: memoryEvaluationCases.length,
  explicitRecall: acceptedPositive / expectedPositive,
  falsePositiveRate: falsePositive / memoryEvaluationCases.filter((item) => !item.shouldRemember).length,
  relationRecall: matchedRelations / expectedRelations,
};
console.log(JSON.stringify(report, null, 2));
if (report.explicitRecall < 0.95 || report.relationRecall < 0.85 || report.falsePositiveRate > 0.1) {
  throw new Error(`记忆模型评测未达到发布门槛：${JSON.stringify(report)}`);
}
