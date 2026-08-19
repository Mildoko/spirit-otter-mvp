import { describe, expect, it } from "vitest";
import { DemoStore } from "../../src/demo/store.js";
import { resolveEventTime } from "../../src/modules/memory/temporal.js";
import type { MemoryCandidate, MemoryRelationCandidateV1 } from "@otter/shared";

const preference = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  kind: "user_preference", content: "喜欢一次只问一个问题", structuredKey: "conversation.question_count",
  structuredValue: "one", origin: "user_explicit", sensitivity: "normal", importance: 0.9, confidence: 0.95,
  evidence: "我喜欢一次只问一个问题", ...overrides,
});

describe("trusted memory v2", () => {
  it("resolves only supported exact or relative event times", () => {
    const now = new Date("2026-08-19T12:00:00+08:00");
    expect(resolveEventTime("昨天", now)?.getTime()).toBe(now.getTime() - 86_400_000);
    expect(resolveEventTime("2026年8月18日", now)?.getFullYear()).toBe(2026);
    expect(resolveEventTime("上个月某天", now)).toBeUndefined();
  });

  it("stores an explicit relation and lets the user correct and delete memory", () => {
    const store = new DemoStore();
    const manager = preference({ kind: "user_fact", content: "主管说话很强势", structuredKey: "person.manager", evidence: "主管说话很强势" });
    const meeting = preference({ kind: "episode", content: "明天要和主管开会", structuredKey: "event.manager_meeting", evidence: "明天要和主管开会", eventTimeText: "明天" });
    const relation: MemoryRelationCandidateV1 = { sourceKey: "event.manager_meeting", targetKey: "person.manager", type: "involves", origin: "user_explicit", confidence: 0.95, evidence: "和主管开会" };
    store.persistMemories([manager, meeting], [relation], "主管说话很强势，明天要和主管开会", true);
    const memories = store.listMemories("active");
    expect(memories).toHaveLength(2);
    expect(memories.flatMap((memory) => memory.relations)).toHaveLength(2);
    const corrected = store.decideMemory(memories[0]!.id, { action: "correct", content: "主管表达直接，但并非总是强势" });
    expect(corrected).toMatchObject({ claimState: "confirmed", status: "active" });
    store.deleteMemory(corrected.id);
    expect(store.listMemories().some((memory) => memory.id === corrected.id)).toBe(false);
  });

  it("presents an inferred relation once and suppresses rejected memories", () => {
    const store = new DemoStore();
    const event = preference({ kind: "episode", content: "和主管开会时紧张", structuredKey: "event.meeting", evidence: "和主管开会时紧张", origin: "model_inference", importance: 0.9, confidence: 0.95 });
    const person = preference({ kind: "user_fact", content: "当前主管", structuredKey: "person.manager", evidence: "主管" });
    const relation: MemoryRelationCandidateV1 = { sourceKey: "event.meeting", targetKey: "person.manager", type: "may_trigger", origin: "model_inference", confidence: 0.95, evidence: "和主管开会时紧张" };
    store.persistMemories([event, person], [relation], "和主管开会时紧张", true);
    const first = store.recallMemories("主管会议", true);
    store.markRelationsPresented(first);
    const second = store.recallMemories("主管会议", true);
    expect(first.some((memory) => memory.relationNote)).toBe(true);
    expect(second.some((memory) => memory.relationNote)).toBe(false);
    const inferred = store.listMemories().find((memory) => memory.claimState === "hypothesis")!;
    store.decideMemory(inferred.id, { action: "reject" });
    store.persistMemories([event], [], "和主管开会时紧张", true);
    expect(store.listMemories("active").filter((memory) => memory.content === event.content)).toHaveLength(0);
  });

  it("remains bounded when the same memories and relation are extracted repeatedly", () => {
    const store = new DemoStore();
    const event = preference({ kind: "episode", content: "明天和主管开会", structuredKey: "event.manager_meeting", evidence: "明天和主管开会" });
    const person = preference({ kind: "user_fact", content: "主管表达很直接", structuredKey: "person.manager", evidence: "主管表达很直接" });
    const relation: MemoryRelationCandidateV1 = { sourceKey: "event.manager_meeting", targetKey: "person.manager", type: "involves", origin: "user_explicit", confidence: 0.98, evidence: "明天和主管开会" };
    for (let index = 0; index < 500; index += 1) {
      store.persistMemories([event, person], [relation], "明天和主管开会，主管表达很直接", true);
    }
    const memories = store.listMemories("active");
    const relationIds = new Set(memories.flatMap((memory) => memory.relations.map((item) => item.id)));
    expect(memories).toHaveLength(2);
    expect(relationIds.size).toBe(1);
    expect(store.recallMemories("主管开会", true)).toHaveLength(2);
  });
});
