import { BrowserSpeechAdapter } from "./speech-adapter";
import type { SpeechAdapter, SpeechHandle, SpeechRequest } from "./types";

interface ActiveCloudSpeech {
  controller: AbortController;
  audio?: HTMLAudioElement;
  objectUrl?: string;
  fallbackHandle?: SpeechHandle;
  cancelled: boolean;
}

export class CloudFirstSpeechAdapter implements SpeechAdapter {
  private active: ActiveCloudSpeech | null = null;
  private cloudEnabled = false;

  constructor(
    private readonly fallback: SpeechAdapter = new BrowserSpeechAdapter(),
    private readonly request: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  isSupported(): boolean { return typeof Audio !== "undefined" || this.fallback.isSupported(); }
  setCloudEnabled(enabled: boolean): void { this.cloudEnabled = enabled; }

  speak(request: SpeechRequest): SpeechHandle {
    this.cancel();
    if (!this.cloudEnabled) return this.fallback.speak(request);
    const active: ActiveCloudSpeech = { controller: new AbortController(), cancelled: false };
    this.active = active;

    const useFallback = () => {
      if (active.cancelled) return;
      active.fallbackHandle = this.fallback.speak(request);
    };

    void this.request("/api/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: request.text, profileId: request.id.startsWith("welcome-") ? "tata.welcome" : request.profile.id }),
      signal: active.controller.signal,
    }).then(async (response) => {
      if (!response.ok || active.cancelled || typeof Audio === "undefined") { useFallback(); return; }
      const blob = await response.blob();
      if (active.cancelled) return;
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      active.objectUrl = objectUrl;
      active.audio = audio;
      audio.volume = request.volume;
      audio.onplay = () => request.onStart?.();
      audio.onended = () => { request.onEnd?.(); this.release(active); };
      audio.onerror = () => { this.releaseAudio(active); useFallback(); };
      await audio.play().catch(() => { this.releaseAudio(active); useFallback(); });
    }).catch((reason: unknown) => {
      if (!active.cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) useFallback();
    });

    return { cancel: () => this.cancelActive(active) };
  }

  cancel(): void {
    if (this.active) this.cancelActive(this.active);
    this.fallback.cancel();
  }

  dispose(): void { this.cancel(); this.fallback.dispose(); }

  private cancelActive(active: ActiveCloudSpeech): void {
    active.cancelled = true;
    active.controller.abort();
    active.audio?.pause();
    active.fallbackHandle?.cancel();
    this.release(active);
  }

  private release(active: ActiveCloudSpeech): void {
    this.releaseAudio(active);
    if (this.active === active) this.active = null;
  }

  private releaseAudio(active: ActiveCloudSpeech): void {
    if (active.objectUrl) URL.revokeObjectURL(active.objectUrl);
    delete active.objectUrl;
    delete active.audio;
  }
}
