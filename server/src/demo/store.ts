import { randomUUID } from "node:crypto";
import type {
  ActionStatus,
  ActiveSpirit,
  EmotionState,
  MemoryCandidate,
  PromptMemory,
  PublicActionItem,
  PublicFollowup,
  PublicMessage,
} from "@otter/shared";
import { applyMemoryBudget, rankMemories, type RecallCandidate } from "../modules/memory/ranker.js";

export interface DemoStateEntry {
  raw: EmotionState;
  smoothed: EmotionState;
}

interface DemoMemory extends RecallCandidate {
  structuredValue?: string;
  origin: MemoryCandidate["origin"];
  sensitivity: MemoryCandidate["sensitivity"];
  confidence: number;
  status: "active" | "superseded";
  evidence: string;
}

export class DemoStore {
  readonly conversationId = "demo-conversation";
  readonly researchId = "DEMO-LOCAL";
  activeSpirit: ActiveSpirit = "deep_tide";
  spiritTurnCount = 0;
  companionLockTurns = 0;
  messages: PublicMessage[] = [];
  actions: PublicActionItem[] = [];
  followups: PublicFollowup[] = [];
  states: DemoStateEntry[] = [];
  private memories: DemoMemory[] = [];
  private safetyTurns = new Set<string>();

  reset(): void {
    this.activeSpirit = "deep_tide";
    this.spiritTurnCount = 0;
    this.companionLockTurns = 0;
    this.messages = [];
    this.actions = [];
    this.followups = [];
    this.states = [];
    this.memories = [];
    this.safetyTurns.clear();
  }

  addMessage(role: PublicMessage["role"], content: string): PublicMessage {
    const message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() };
    this.messages.push(message);
    return message;
  }

  persistMemories(candidates: MemoryCandidate[], now = new Date()): void {
    for (const candidate of candidates.slice(0, 2)) {
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
      this.memories.push({
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
        status: "active",
      });
    }
  }

  recallMemories(query: string): PromptMemory[] {
    const candidates = this.memories.filter((memory) => memory.status === "active" && ["normal", "personal"].includes(memory.sensitivity));
    return applyMemoryBudget(rankMemories(candidates, query));
  }

  exportMemories(): Array<Record<string, unknown>> {
    return this.memories.map(({ observedAtDate: _observedAtDate, relevanceNote: _relevanceNote, ...memory }) => memory);
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
