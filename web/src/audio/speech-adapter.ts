import type { SpeechAdapter, SpeechHandle, SpeechRequest, VoiceProfileV1 } from "./types";

export function chooseChineseVoice(voices: readonly SpeechSynthesisVoice[], profile: VoiceProfileV1): SpeechSynthesisVoice | null {
  const exact = voices.filter((voice) => voice.lang.toLowerCase() === profile.locale.toLowerCase());
  const chinese = voices.filter((voice) => voice.lang.toLowerCase().startsWith("zh"));
  const pool = exact.length > 0 ? exact : chinese;
  return pool.find((voice) => profile.preferredVoiceNames.some((name) => voice.name.toLowerCase().includes(name.toLowerCase())))
    ?? pool.find((voice) => voice.localService)
    ?? pool[0]
    ?? voices.find((voice) => voice.default)
    ?? voices[0]
    ?? null;
}

export class BrowserSpeechAdapter implements SpeechAdapter {
  private activeToken = 0;

  constructor(
    private readonly synthesis: SpeechSynthesis | undefined = globalThis.speechSynthesis,
    private readonly createUtterance: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text),
  ) {}

  isSupported(): boolean {
    return Boolean(this.synthesis && typeof this.createUtterance === "function");
  }

  speak(request: SpeechRequest): SpeechHandle {
    if (!this.synthesis) {
      request.onError?.("当前浏览器不支持系统语音");
      return { cancel() {} };
    }
    this.cancel();
    const token = ++this.activeToken;
    const utterance = this.createUtterance(request.text);
    utterance.lang = request.profile.locale;
    utterance.rate = request.profile.rate;
    utterance.pitch = request.profile.pitch;
    utterance.volume = Math.max(0, Math.min(1, request.volume));
    utterance.voice = chooseChineseVoice(this.synthesis.getVoices(), request.profile);
    let finished = false;
    const finish = (kind: "end" | "error", message?: string) => {
      if (finished || token !== this.activeToken) return;
      finished = true;
      if (kind === "error") request.onError?.(message ?? "语音播放失败");
      request.onEnd?.();
    };
    utterance.onstart = () => { if (token === this.activeToken) request.onStart?.(); };
    utterance.onend = () => finish("end");
    utterance.onerror = (event) => event.error === "canceled" || event.error === "interrupted"
      ? finish("end")
      : finish("error", "系统语音播放失败");
    this.synthesis.speak(utterance);
    return { cancel: () => { if (token === this.activeToken) this.cancel(); } };
  }

  cancel(): void {
    this.activeToken += 1;
    this.synthesis?.cancel();
  }

  dispose(): void { this.cancel(); }
}
