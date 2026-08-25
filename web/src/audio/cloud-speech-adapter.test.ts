import { describe, expect, it, vi } from "vitest";
import { CloudFirstSpeechAdapter } from "./cloud-speech-adapter";
import type { SpeechAdapter, SpeechRequest } from "./types";

describe("cloud-first 鹿禅 speech adapter", () => {
  it("falls back to the browser voice when cloud speech is unavailable", async () => {
    const fallback: SpeechAdapter = {
      speak: vi.fn(() => ({ cancel: vi.fn() })), cancel: vi.fn(), isSupported: () => true, dispose: vi.fn(),
    };
    const adapter = new CloudFirstSpeechAdapter(fallback, vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch);
    adapter.setCloudEnabled(true);
    const request = { id: "reply", text: "你好", profile: { id: "zen_deer.deep_tide", agentId: "zen_deer", locale: "zh-CN", rate: 0.82, pitch: 0.78, preferredVoiceNames: [] }, volume: 0.8 } satisfies SpeechRequest;
    adapter.speak(request);
    await vi.waitFor(() => expect(fallback.speak).toHaveBeenCalledWith(request));
  });
});
