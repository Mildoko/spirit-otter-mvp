import type { ChatTurnResponse, EmotionState, PublicEmotionFeedback, RawSignals, ResponsePlan, RiskLevel, RuntimeInfo } from "@otter/shared";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }), ...init?.headers },
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
}

export interface DevEvaluation {
  signals: RawSignals;
  state: EmotionState;
  riskLevel: RiskLevel;
  ruleCodes: string[];
  plan: ResponsePlan;
  reply: string;
  actionDraft: string | null;
  emotionFeedback?: PublicEmotionFeedback;
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
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  }),
  confirmAction: (id: string, decision: "confirm" | "abandon", text?: string) => request(`/actions/${id}/confirm`, { method: "POST", body: JSON.stringify({ decision, text }) }),
  updateAction: (id: string, status: "completed" | "deferred" | "deleted") => request(`/actions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  createFollowup: (actionId: string, dueAt: string) => request("/followups", { method: "POST", body: JSON.stringify({ actionId, dueAt, authorized: true }) }),
  updateFollowup: (id: string, status: "completed" | "deferred" | "closed" | "deleted") => request(`/followups/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  requestHelp: (turnId: string) => request<{ requested: boolean; contact: string }>(`/safety-events/${turnId}/request-help`, { method: "POST", body: "{}" }),
  logout: () => request<void>("/auth/logout", { method: "POST", body: "{}" }),
  deleteMe: () => request<void>("/me/data", { method: "DELETE" }),
  exportMe: async () => {
    const response = await fetch("/api/me/export", { credentials: "include" });
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
