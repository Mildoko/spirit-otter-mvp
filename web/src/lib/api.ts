import type { CharacterDiagnostics, ChatTurnResponse, EmotionCorrectionLabelV1, EmotionCorrectionV1, EmotionState, MemoryDecisionV2, MemoryRelationDecisionV1, MemoryStatus, PublicEmotionFeedback, PublicEmotionInterpretation, PublicMemoryPageV2, PublicMemoryRelationV1, PublicMemoryV2, RawSignals, ResponsePlan, RiskLevel, RuntimeInfo } from "@otter/shared";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const demoSessionStorageKey = "otter-demo-session";

export function createRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function demoSessionHeader(): Record<string, string> {
  let sessionId = window.localStorage.getItem(demoSessionStorageKey);
  if (!sessionId) {
    sessionId = createRequestId();
    window.localStorage.setItem(demoSessionStorageKey, sessionId);
  }
  return { "X-Otter-Demo-Session": sessionId };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { ...demoSessionHeader(), ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }), ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { code: "REQUEST_FAILED", message: "请求失败" } }));
    throw new ApiError(response.status, payload.error?.code ?? "REQUEST_FAILED", payload.error?.message ?? "请求失败");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface BootstrapData {
  researchId: string;
  researchContact: string;
  aiReminder: string;
  conversation: { id: string };
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>;
  actions: Array<{ id: string; text: string; status: string; createdAt: string }>;
  followups: Array<{ id: string; actionId: string; dueAt: string; status: string; action: { id: string; text: string; status: string } }>;
  lastEmotion?: { turnId: string; interpretation: PublicEmotionInterpretation };
  visit: {
    visitId: string;
    currentVisitAt: string;
    previousVisitAt?: string;
    isReturning: boolean;
  };
}

export interface DevEvaluation {
  signals: RawSignals;
  state: EmotionState;
  riskLevel: RiskLevel;
  ruleCodes: string[];
  plan: ResponsePlan;
  reply: string;
  actionDraft: string | null;
  characterDiagnostics?: CharacterDiagnostics;
  emotionFeedback?: PublicEmotionFeedback;
  emotionInterpretation?: PublicEmotionInterpretation;
  metrics: Array<{ provider: string; model: string; latencyMs: number; promptTokens?: number; outputTokens?: number }>;
  source: "cloud_model" | "local_fallback";
  warning: string;
}

export const api = {
  runtime: () => request<RuntimeInfo>("/runtime"),
  devStatus: () => request<{ localTestMode: boolean; modelConfigured: boolean; provider: string; model: string }>("/dev/status"),
  devEvaluate: (body: { text: string; currentSpirit: "deep_tide" | "shore_pick"; spiritTurnCount: number; companionLockTurns: number; recentContext: string[] }) => request<DevEvaluation>("/dev/evaluate", { method: "POST", body: JSON.stringify(body) }),
  bootstrap: () => request<BootstrapData>("/session/bootstrap"),
  redeem: (body: Record<string, unknown>) => request<{ researchId: string; conversationId: string }>("/auth/redeem-invite", { method: "POST", body: JSON.stringify(body) }),
  turn: (body: { conversationId: string; text: string }) => request<ChatTurnResponse>("/chat/turn", {
    method: "POST",
    headers: { "Idempotency-Key": createRequestId() },
    body: JSON.stringify(body),
  }),
  correctEmotion: (body: { turnId: string; verdict: EmotionCorrectionV1["verdict"]; labels?: EmotionCorrectionLabelV1[] }) => request<{ correction: EmotionCorrectionV1; emotionInterpretation: PublicEmotionInterpretation }>("/emotion-corrections", { method: "POST", body: JSON.stringify({ ...body, labels: body.labels ?? [] }) }),
  confirmAction: (id: string, decision: "confirm" | "abandon", text?: string) => request(`/actions/${id}/confirm`, { method: "POST", body: JSON.stringify({ decision, text }) }),
  updateAction: (id: string, status: "completed" | "deferred" | "deleted") => request(`/actions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createFollowup: (actionId: string, dueAt: string) => request("/followups", { method: "POST", body: JSON.stringify({ actionId, dueAt, authorized: true }) }),
  updateFollowup: (id: string, status: "completed" | "deferred" | "closed" | "deleted") => request(`/followups/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  requestHelp: (turnId: string) => request<{ requested: boolean; contact: string }>(`/safety-events/${turnId}/request-help`, { method: "POST", body: "{}" }),
  memories: (status?: MemoryStatus) => request<PublicMemoryPageV2>(`/me/memories${status ? `?status=${status}` : ""}`),
  decideMemory: (id: string, decision: MemoryDecisionV2) => request<PublicMemoryV2>(`/me/memories/${id}`, { method: "PATCH", body: JSON.stringify(decision) }),
  deleteMemory: (id: string) => request<void>(`/me/memories/${id}`, { method: "DELETE" }),
  decideMemoryRelation: (id: string, decision: MemoryRelationDecisionV1) => request<PublicMemoryRelationV1>(`/me/memory-relations/${id}`, { method: "PATCH", body: JSON.stringify(decision) }),
  deleteMemoryRelation: (id: string) => request<void>(`/me/memory-relations/${id}`, { method: "DELETE" }),
  logout: () => request<void>("/auth/logout", { method: "POST", body: "{}" }),
  deleteMe: () => request<void>("/me/data", { method: "DELETE" }),
  exportMe: async () => {
    const response = await fetch("/api/me/export", { credentials: "include", headers: demoSessionHeader() });
    if (!response.ok) throw new Error("导出失败");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "spirit-otter-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
