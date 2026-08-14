import type { MemoryKind, PromptMemory } from "@otter/shared";

export interface RecallCandidate extends PromptMemory {
  structuredKey: string;
  importance: number;
  observedAtDate: Date;
}

const typePriority: Record<MemoryKind, number> = {
  boundary: 1,
  user_preference: 0.95,
  support_strategy: 0.9,
  relationship_milestone: 0.75,
  user_fact: 0.7,
  episode: 0.6,
};

function bigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, "").replace(/[，。！？、；：“”‘’（）,.!?;:'"()]/g, "");
  const result = new Set<string>();
  if (normalized.length === 1) result.add(normalized);
  for (let i = 0; i < normalized.length - 1; i += 1) result.add(normalized.slice(i, i + 2));
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function rankMemories(candidates: RecallCandidate[], query: string, now = new Date()): RecallCandidate[] {
  const queryGrams = bigrams(query);
  return [...candidates].sort((left, right) => {
    const score = (item: RecallCandidate) => {
      const lexical = jaccard(queryGrams, bigrams(item.content));
      const ageDays = Math.max(0, now.getTime() - item.observedAtDate.getTime()) / 86_400_000;
      const recency = Math.pow(0.5, ageDays / 7);
      const keyBoost = query.toLowerCase().includes(item.structuredKey.toLowerCase()) ? 0.2 : 0;
      return Math.min(1, lexical * 0.4 + item.importance * 0.25 + recency * 0.2 + typePriority[item.kind] * 0.15 + keyBoost);
    };
    return score(right) - score(left);
  });
}

export function applyMemoryBudget(ranked: RecallCandidate[], maxItems = 6, maxChars = 1200): RecallCandidate[] {
  const selected: RecallCandidate[] = [];
  let chars = 0;
  let stableCount = 0;
  let eventCount = 0;
  for (const item of ranked) {
    const stable = ["boundary", "user_preference", "support_strategy"].includes(item.kind);
    const event = ["episode", "relationship_milestone"].includes(item.kind);
    if (stable && stableCount >= 2) continue;
    if (event && eventCount >= 3) continue;
    if (selected.length >= maxItems || chars + item.content.length > maxChars) continue;
    selected.push(item);
    chars += item.content.length;
    if (stable) stableCount += 1;
    if (event) eventCount += 1;
  }
  return selected;
}
