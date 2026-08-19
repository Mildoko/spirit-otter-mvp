import { randomUUID } from "node:crypto";
import type {
  ActionStatus,
  ActiveSpirit,
  EmotionState,
  EmotionCorrectionLabelV1,
  EmotionCorrectionV1,
  EmotionHypothesisV1,
  GuidanceStateV1,
  MemoryCandidate,
  MemoryDecisionV2,
  MemoryRelationCandidateV1,
  MemoryRelationDecisionV1,
  PromptMemory,
  PublicActionItem,
  PublicFollowup,
  PublicMessage,
  PublicMemoryRelationV1,
  PublicMemoryV2,
} from "@otter/shared";
import { applyMemoryBudget, rankMemories, type RecallCandidate } from "../modules/memory/ranker.js";
import { filterMemoryCandidates, filterMemoryRelationCandidates } from "../modules/memory/guard.js";
import { resolveEventTime } from "../modules/memory/temporal.js";
import { DEFAULT_GUIDANCE_STATE } from "../modules/support/guidance-state.js";

export interface DemoStateEntry {
  raw: EmotionState;
  smoothed: EmotionState;
}

interface DemoEmotionRecord {
  turnId: string;
  hypothesis: EmotionHypothesisV1;
  recordedAt: string;
  displayable: boolean;
  correction?: EmotionCorrectionV1;
}

interface DemoMemory extends RecallCandidate {
  structuredValue?: string;
  origin: MemoryCandidate["origin"];
  sensitivity: MemoryCandidate["sensitivity"];
  confidence: number;
  claimState: "asserted" | "hypothesis" | "confirmed";
  status: "active" | "disabled" | "rejected" | "superseded" | "expired" | "deleted";
  evidence: string;
  validFrom: string;
  validTo?: string;
  eventAt?: string;
  reviewExpiresAt?: string;
  expiresAt: string;
}

interface DemoMemoryRelation {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  type: MemoryRelationCandidateV1["type"];
  origin: MemoryRelationCandidateV1["origin"];
  claimState: "asserted" | "hypothesis" | "confirmed";
  confidence: number;
  status: "active" | "disabled" | "rejected" | "expired";
  evidence: string;
  observedAt: string;
  validFrom: string;
  validTo?: string;
  reviewExpiresAt?: string;
  presentedAt?: string;
}

export class DemoStore {
  readonly conversationId = "demo-conversation";
  readonly researchId = "DEMO-LOCAL";
  lastVisitAt: string | undefined;
  activeSpirit: ActiveSpirit = "deep_tide";
  spiritTurnCount = 0;
  companionLockTurns = 0;
  guidanceState: GuidanceStateV1 = { ...DEFAULT_GUIDANCE_STATE };
  messages: PublicMessage[] = [];
  actions: PublicActionItem[] = [];
  followups: PublicFollowup[] = [];
  states: DemoStateEntry[] = [];
  emotionRecords: DemoEmotionRecord[] = [];
  private pendingEmotionCorrection: EmotionCorrectionV1 | null = null;
  private memories: DemoMemory[] = [];
  private memoryRelations: DemoMemoryRelation[] = [];
  private safetyTurns = new Set<string>();

  reset(): void {
    this.lastVisitAt = undefined;
    this.activeSpirit = "deep_tide";
    this.spiritTurnCount = 0;
    this.companionLockTurns = 0;
    this.guidanceState = { ...DEFAULT_GUIDANCE_STATE };
    this.messages = [];
    this.actions = [];
    this.followups = [];
    this.states = [];
    this.emotionRecords = [];
    this.pendingEmotionCorrection = null;
    this.memories = [];
    this.memoryRelations = [];
    this.safetyTurns.clear();
  }

  addMessage(role: PublicMessage["role"], content: string): PublicMessage {
    const message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() };
    this.messages.push(message);
    return message;
  }

  persistMemories(candidates: MemoryCandidate[], relations: MemoryRelationCandidateV1[] = [], userText = "", memoryV2Enabled = false, now = new Date()): void {
    const resolvedByKey = new Map(this.memories.filter((memory) => memory.status === "active").map((memory) => [memory.structuredKey, memory]));
    for (const candidate of filterMemoryCandidates(candidates, userText || candidates.map((item) => item.evidence).join(" "))) {
      if (memoryV2Enabled && this.memories.some((memory) => memory.status === "rejected" && memory.kind === candidate.kind && memory.content === candidate.content)) continue;
      const duplicate = this.memories.some((memory) => memory.status === "active" && memory.kind === candidate.kind && memory.content === candidate.content);
      if (duplicate) continue;
      if (["user_fact", "user_preference", "boundary", "support_strategy"].includes(candidate.kind)) {
        for (const memory of this.memories) {
          if (memory.status === "active" && memory.kind === candidate.kind && memory.structuredKey === candidate.structuredKey) {
            memory.status = "superseded";
          }
        }
      }
      const relevanceNote: PromptMemory["relevanceNote"] = ["boundary", "user_preference", "support_strategy"].includes(candidate.kind)
        ? "current_preference"
        : candidate.kind === "relationship_milestone" ? "relationship_context" : "historical_event";
      const hypothesis = memoryV2Enabled && candidate.origin === "model_inference";
      const eventAt = resolveEventTime(candidate.eventTimeText, now);
      const memory: DemoMemory = {
        id: randomUUID(),
        kind: candidate.kind,
        content: candidate.content,
        structuredKey: candidate.structuredKey,
        ...(candidate.structuredValue !== undefined ? { structuredValue: candidate.structuredValue } : {}),
        importance: candidate.importance,
        confidence: candidate.confidence,
        origin: candidate.origin,
        sensitivity: candidate.sensitivity,
        evidence: candidate.evidence,
        observedAt: now.toISOString(),
        observedAtDate: now,
        relevanceNote,
        claimState: hypothesis ? "hypothesis" : "asserted",
        status: "active",
        validFrom: now.toISOString(),
        ...(eventAt ? { eventAt: eventAt.toISOString() } : {}),
        ...(hypothesis ? { reviewExpiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() } : {}),
        expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      };
      this.memories.push(memory);
      resolvedByKey.set(candidate.structuredKey, memory);
    }
    if (!memoryV2Enabled) return;
    for (const candidate of filterMemoryRelationCandidates(relations, userText)) {
      const source = resolvedByKey.get(candidate.sourceKey);
      const target = resolvedByKey.get(candidate.targetKey);
      if (!source || !target) continue;
      const duplicate = this.memoryRelations.some((relation) => relation.sourceMemoryId === source.id && relation.targetMemoryId === target.id && relation.type === candidate.type && ["active", "rejected"].includes(relation.status));
      if (duplicate) continue;
      const hypothesis = candidate.origin === "model_inference";
      this.memoryRelations.push({
        id: randomUUID(), sourceMemoryId: source.id, targetMemoryId: target.id, type: candidate.type,
        origin: candidate.origin, claimState: hypothesis ? "hypothesis" : "asserted", confidence: candidate.confidence,
        status: "active", evidence: candidate.evidence, observedAt: now.toISOString(), validFrom: now.toISOString(),
        ...(hypothesis ? { reviewExpiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() } : {}),
      });
    }
  }

  recallMemories(query: string, memoryV2Enabled = false, now = new Date()): PromptMemory[] {
    const candidates = this.memories.filter((memory) => memory.status === "active" && ["normal", "personal"].includes(memory.sensitivity)
      && (!memory.validTo || new Date(memory.validTo) > now) && (!memory.reviewExpiresAt || new Date(memory.reviewExpiresAt) > now));
    const direct = rankMemories(candidates.map((memory) => ({ ...memory })), query).slice(0, memoryV2Enabled ? 4 : 50);
    if (!memoryV2Enabled) return applyMemoryBudget(direct);
    const directIds = new Set(direct.map((memory) => memory.id));
    const linked: DemoMemory[] = [];
    for (const relation of this.memoryRelations.filter((item) => item.status === "active" && (!item.reviewExpiresAt || new Date(item.reviewExpiresAt) > now) && (item.claimState !== "hypothesis" || !item.presentedAt))) {
      const otherId = directIds.has(relation.sourceMemoryId) ? relation.targetMemoryId : directIds.has(relation.targetMemoryId) ? relation.sourceMemoryId : null;
      if (!otherId) continue;
      const other = candidates.find((memory) => memory.id === otherId);
      if (!other) continue;
      if (directIds.has(other.id)) {
        const directMemory = direct.find((memory) => memory.id === other.id);
        if (directMemory && !directMemory.relationNote) { directMemory.relationNote = `${relation.claimState === "hypothesis" ? "未确认推测关系" : "已知关系"} ${relation.type}：${other.content}`; if (relation.claimState === "hypothesis") directMemory.relationId = relation.id; }
        continue;
      }
      if (linked.some((memory) => memory.id === other.id)) continue;
      linked.push({ ...other, relationNote: `${relation.claimState === "hypothesis" ? "未确认推测关系" : "已知关系"} ${relation.type}：${other.content}`, ...(relation.claimState === "hypothesis" ? { relationId: relation.id } : {}) });
      if (linked.length >= 2) break;
    }
    return applyMemoryBudget([...direct, ...linked]);
  }

  markRelationsPresented(memories: PromptMemory[], now = new Date()): void {
    const ids = new Set(memories.flatMap((memory) => memory.relationId ? [memory.relationId] : []));
    for (const relation of this.memoryRelations) if (ids.has(relation.id) && relation.claimState === "hypothesis" && !relation.presentedAt) relation.presentedAt = now.toISOString();
  }

  exportMemories(): Array<Record<string, unknown>> {
    return this.memories.map(({ observedAtDate: _observedAtDate, relevanceNote: _relevanceNote, ...memory }) => ({
      ...memory, relations: this.memoryRelations.filter((relation) => relation.sourceMemoryId === memory.id || relation.targetMemoryId === memory.id),
    }));
  }

  listMemories(status?: DemoMemory["status"]): PublicMemoryV2[] {
    return this.memories.filter((memory) => !status || memory.status === status).map((memory) => this.publicMemory(memory));
  }

  decideMemory(id: string, decision: MemoryDecisionV2, now = new Date()): PublicMemoryV2 {
    const memory = this.requireMemory(id);
    if (decision.action === "confirm") { memory.claimState = "confirmed"; memory.status = "active"; delete memory.reviewExpiresAt; }
    else if (decision.action === "disable") memory.status = "disabled";
    else if (decision.action === "enable") memory.status = "active";
    else if (decision.action === "reject") { memory.status = "rejected"; memory.validTo = now.toISOString(); }
    else {
      memory.status = "superseded"; memory.validTo = now.toISOString();
      const structuredValue = decision.structuredValue ?? memory.structuredValue;
      const replacement: DemoMemory = { ...memory, id: randomUUID(), content: decision.content.trim(), ...(structuredValue !== undefined ? { structuredValue } : {}), origin: "user_explicit", claimState: "confirmed", confidence: 1, status: "active", observedAt: now.toISOString(), observedAtDate: now, validFrom: now.toISOString() };
      delete replacement.validTo; delete replacement.reviewExpiresAt;
      this.memories.push(replacement);
      return this.publicMemory(replacement);
    }
    return this.publicMemory(memory);
  }

  deleteMemory(id: string): void {
    if (!this.memories.some((memory) => memory.id === id)) this.notFound();
    this.memories = this.memories.filter((memory) => memory.id !== id);
    this.memoryRelations = this.memoryRelations.filter((relation) => relation.sourceMemoryId !== id && relation.targetMemoryId !== id);
  }

  decideRelation(id: string, decision: MemoryRelationDecisionV1, now = new Date()): PublicMemoryRelationV1 {
    const relation = this.memoryRelations.find((item) => item.id === id);
    if (!relation) this.notFound();
    if (decision.action === "confirm") { relation.claimState = "confirmed"; relation.status = "active"; delete relation.reviewExpiresAt; }
    else if (decision.action === "disable") relation.status = "disabled";
    else if (decision.action === "enable") relation.status = "active";
    else { relation.status = "rejected"; relation.validTo = now.toISOString(); }
    return this.publicRelation(relation);
  }

  deleteRelation(id: string): void {
    if (!this.memoryRelations.some((relation) => relation.id === id)) this.notFound();
    this.memoryRelations = this.memoryRelations.filter((relation) => relation.id !== id);
  }

  private publicMemory(memory: DemoMemory): PublicMemoryV2 {
    return {
      schemaVersion: 2, id: memory.id, kind: memory.kind, content: memory.content,
      ...(memory.structuredValue ? { structuredValue: memory.structuredValue } : {}), claimState: memory.claimState, status: memory.status,
      observedAt: memory.observedAt, ...(memory.eventAt ? { eventAt: memory.eventAt } : {}), validFrom: memory.validFrom,
      ...(memory.validTo ? { validTo: memory.validTo } : {}), evidence: [{ excerpt: memory.evidence, capturedAt: memory.observedAt }],
      relations: this.memoryRelations.filter((relation) => relation.sourceMemoryId === memory.id || relation.targetMemoryId === memory.id).map((relation) => this.publicRelation(relation)),
    };
  }

  private publicRelation(relation: DemoMemoryRelation): PublicMemoryRelationV1 {
    const source = this.requireMemory(relation.sourceMemoryId); const target = this.requireMemory(relation.targetMemoryId);
    return { id: relation.id, type: relation.type, sourceMemoryId: source.id, targetMemoryId: target.id, sourceContent: source.content, targetContent: target.content, claimState: relation.claimState, status: relation.status, confidence: relation.confidence, observedAt: relation.observedAt };
  }

  private requireMemory(id: string): DemoMemory { const memory = this.memories.find((item) => item.id === id); if (!memory) this.notFound(); return memory; }
  private notFound(): never { throw Object.assign(new Error("记忆不存在"), { statusCode: 404, code: "NOT_FOUND" }); }

  recordEmotion(turnId: string, hypothesis: EmotionHypothesisV1, displayable: boolean, now = new Date()): void {
    this.emotionRecords.push({ turnId, hypothesis, recordedAt: now.toISOString(), displayable });
  }

  correctEmotion(turnId: string, verdict: EmotionCorrectionV1["verdict"], labels: EmotionCorrectionLabelV1[], now = new Date()): { correction: EmotionCorrectionV1; displayHypothesis: EmotionHypothesisV1 } {
    const record = this.emotionRecords.find((item) => item.turnId === turnId);
    if (!record || !record.displayable) throw Object.assign(new Error("情绪推测不存在"), { statusCode: 404, code: "NOT_FOUND" });
    const correction: EmotionCorrectionV1 = { turnId, verdict, labels, createdAt: now.toISOString() };
    record.correction = correction;
    this.pendingEmotionCorrection = verdict === "accurate" ? null : correction;
    const displayHypothesis = this.displayHypothesis(record);
    return { correction, displayHypothesis };
  }

  latestDisplayEmotion(): { turnId: string; hypothesis: EmotionHypothesisV1 } | undefined {
    const record = this.emotionRecords.at(-1);
    return record?.displayable ? { turnId: record.turnId, hypothesis: this.displayHypothesis(record) } : undefined;
  }

  getPendingEmotionCorrection(): EmotionCorrectionV1 | undefined {
    return this.pendingEmotionCorrection ?? undefined;
  }

  consumePendingEmotionCorrection(): void {
    this.pendingEmotionCorrection = null;
  }

  exportEmotionRecords(): DemoEmotionRecord[] {
    return this.emotionRecords.map((record) => ({
      turnId: record.turnId,
      hypothesis: structuredClone(record.hypothesis),
      recordedAt: record.recordedAt,
      displayable: record.displayable,
      ...(record.correction ? { correction: structuredClone(record.correction) } : {}),
    }));
  }

  private displayHypothesis(record: DemoEmotionRecord): EmotionHypothesisV1 {
    const correction = record.correction;
    if (!correction || correction.verdict === "accurate") return record.hypothesis;
    if (correction.verdict === "unknown" || correction.verdict === "neutral") {
      return { ...record.hypothesis, status: correction.verdict, subject: "user", labels: [], confidence: 1 };
    }
    return {
      ...record.hypothesis,
      status: "user_corrected",
      subject: "user",
      labels: correction.labels.map((item) => ({ label: item.label, intensity: item.intensityLevel / 5, confidence: 1, evidenceSpans: ["用户主动纠正"] })),
      confidence: 1,
    };
  }

  createAction(text: string): PublicActionItem {
    const existing = this.actions.find((item) => item.status === "draft");
    if (existing) throw Object.assign(new Error("已有待处理行动"), { statusCode: 409, code: "ACTION_EXISTS" });
    const action: PublicActionItem = { id: randomUUID(), text, status: "draft", createdAt: new Date().toISOString() };
    this.actions.unshift(action);
    return action;
  }

  confirmAction(id: string, decision: "confirm" | "abandon", text?: string): PublicActionItem {
    const action = this.requireAction(id);
    if (action.status !== "draft") throw Object.assign(new Error("行动已经处理"), { statusCode: 409, code: "ACTION_CLOSED" });
    action.status = decision === "confirm" ? "confirmed" : "deleted";
    if (decision === "confirm" && text?.trim()) action.text = text.trim();
    return action;
  }

  updateAction(id: string, status: Extract<ActionStatus, "completed" | "deferred" | "deleted">): PublicActionItem {
    const action = this.requireAction(id);
    if (action.status === "draft" || action.status === "deleted") {
      throw Object.assign(new Error("可更新的行动不存在"), { statusCode: 404, code: "NOT_FOUND" });
    }
    action.status = status;
    return action;
  }

  createFollowup(actionId: string, dueAt: string): PublicFollowup {
    const action = this.requireAction(actionId);
    if (action.status !== "confirmed") throw Object.assign(new Error("只能为已确认行动创建回访"), { statusCode: 400, code: "ACTION_NOT_CONFIRMED" });
    const due = new Date(dueAt);
    const now = Date.now();
    if (!Number.isFinite(due.getTime()) || due.getTime() <= now || due.getTime() > now + 14 * 86_400_000) {
      throw Object.assign(new Error("回访时间需在未来 14 天内"), { statusCode: 400, code: "INVALID_DUE_AT" });
    }
    const followup: PublicFollowup = { id: randomUUID(), actionId, dueAt: due.toISOString(), status: "pending", action };
    this.followups.push(followup);
    return followup;
  }

  updateFollowup(id: string, status: PublicFollowup["status"]): PublicFollowup {
    const followup = this.followups.find((item) => item.id === id);
    if (!followup || ["closed", "deleted"].includes(followup.status)) {
      throw Object.assign(new Error("回访不存在"), { statusCode: 404, code: "NOT_FOUND" });
    }
    followup.status = status;
    return followup;
  }

  markSafetyTurn(turnId: string): void {
    this.safetyTurns.add(turnId);
  }

  hasSafetyTurn(turnId: string): boolean {
    return this.safetyTurns.has(turnId);
  }

  private requireAction(id: string): PublicActionItem {
    const action = this.actions.find((item) => item.id === id);
    if (!action) throw Object.assign(new Error("行动不存在"), { statusCode: 404, code: "NOT_FOUND" });
    return action;
  }
}
