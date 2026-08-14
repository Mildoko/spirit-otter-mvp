import { describe, expect, it } from "vitest";
import type { RecallCandidate } from "../../src/modules/memory/ranker.js";
import { applyMemoryBudget, rankMemories } from "../../src/modules/memory/ranker.js";

const now = new Date("2026-08-14T00:00:00.000Z");
const memory = (id: string, kind: RecallCandidate["kind"], content: string, daysAgo = 0): RecallCandidate => ({
  id,
  kind,
  content,
  observedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  observedAtDate: new Date(now.getTime() - daysAgo * 86_400_000),
  relevanceNote: ["boundary", "user_preference", "support_strategy"].includes(kind) ? "current_preference" : "historical_event",
  structuredKey: `${kind}.${id}`,
  importance: 0.8,
});

describe("deterministic memory recall ranking", () => {
  it("prioritizes lexical relevance over an unrelated recent item", () => {
    const ranked = rankMemories([
      memory("relevant", "episode", "明天要做项目汇报", 3),
      memory("recent", "episode", "周末去过公园", 0),
    ], "项目汇报怎么办", now);
    expect(ranked[0]?.id).toBe("relevant");
  });

  it("applies the seven-day recency half-life", () => {
    const ranked = rankMemories([
      memory("old", "episode", "相同事件", 14),
      memory("new", "episode", "相同事件", 0),
    ], "相同事件", now);
    expect(ranked[0]?.id).toBe("new");
  });

  it("enforces item, character and type budgets", () => {
    const items = [
      memory("s1", "boundary", "边界一"), memory("s2", "user_preference", "偏好二"), memory("s3", "support_strategy", "策略三"),
      memory("e1", "episode", "事件一"), memory("e2", "episode", "事件二"), memory("e3", "relationship_milestone", "事件三"), memory("e4", "episode", "事件四"),
      memory("f1", "user_fact", "事实一"),
    ];
    const selected = applyMemoryBudget(items, 6, 1200);
    expect(selected).toHaveLength(6);
    expect(selected.filter((item) => ["boundary", "user_preference", "support_strategy"].includes(item.kind))).toHaveLength(2);
    expect(selected.filter((item) => ["episode", "relationship_milestone"].includes(item.kind))).toHaveLength(3);
  });
});
