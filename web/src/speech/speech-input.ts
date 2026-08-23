export type SpeechInputStatus = "idle" | "listening" | "unsupported" | "permission_denied" | "error";

interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { isFinal: boolean; 0: RecognitionAlternativeLike }
interface RecognitionEventLike { results: ArrayLike<RecognitionResultLike> }
interface RecognitionErrorLike { error: string }
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const browser = globalThis as typeof globalThis & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export class BrowserSpeechInputAdapter {
  private active: RecognitionLike | null = null;

  isSupported(): boolean { return Boolean(recognitionConstructor()); }

  start(callbacks: {
    onTranscript(text: string): void;
    onComplete(text: string): void;
    onStatus(status: SpeechInputStatus, message?: string): void;
  }): boolean {
    this.cancel();
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      callbacks.onStatus("unsupported", "当前浏览器不支持语音识别，请使用文字输入");
      return false;
    }

    const recognition = new Constructor();
    let latestTranscript = "";
    let failed = false;
    this.active = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      latestTranscript = `${finalText}${interimText}`.trim();
      callbacks.onTranscript(latestTranscript);
    };
    recognition.onerror = (event) => {
      failed = true;
      if (this.active === recognition) this.active = null;
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      const noSpeech = event.error === "no-speech";
      callbacks.onStatus(
        denied ? "permission_denied" : "error",
        denied
          ? "没有获得麦克风权限，请在浏览器设置中允许后重试"
          : noSpeech
            ? "没有听到清楚的内容，请按住麦克风再说一次"
            : "这次语音没有识别成功，请重试或使用文字输入",
      );
    };
    recognition.onend = () => {
      if (this.active === recognition) this.active = null;
      if (failed) return;
      if (!latestTranscript) {
        callbacks.onStatus("error", "没有听到清楚的内容，请按住麦克风再说一次");
        return;
      }
      callbacks.onStatus("idle");
      callbacks.onComplete(latestTranscript);
    };
    callbacks.onStatus("listening");
    try {
      recognition.start();
      return true;
    } catch {
      this.active = null;
      failed = true;
      callbacks.onStatus("error", "语音输入暂时无法启动，请重试或使用文字输入");
      return false;
    }
  }

  stop(): void { this.active?.stop(); }
  cancel(): void {
    const active = this.active;
    this.active = null;
    if (active) {
      active.onend = null;
      active.onerror = null;
      active.abort();
    }
  }
}
