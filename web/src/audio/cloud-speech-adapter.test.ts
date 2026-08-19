import { describe, expect, it, vi } from "vitest";
import { CloudFirstSpeechAdapter } from "./cloud-speech-adapter";
import type { SpeechAdapter, SpeechRequest } from "./types";

describe("cloud-first tata speech adapter", () => {
  it("falls back to the browser voice when cloud speech is unavailable", async () => {
    const fallback: SpeechAdapter = {
      speak: vi.fn(() => ({ cancel: vi.fn() })), cancel: vi.fn(), isSupported: () => true, dispose: vi.fn(),
    };
    const adapter = new CloudFirstSpeechAdapter(fallback, vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch);
    adapter.setCloudEnabled(true);
    const request = { id: "reply", text: "你好", profile: { id: "spirit_otter.deep_tide", agentId: "spirit_otter", locale: "zh-CN", rate: 0.96, pitch: 1.05, preferredVoiceNames: [] }, volume: 0.8 } satisfies SpeechRequest;
    adapter.speak(request);
    await vi.waitFor(() => expect(fallback.speak).toHaveBeenCalledWith(request));
  });
});
