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
    onStatus(status: SpeechInputStatus, message?: string): void;
  }): void {
    this.cancel();
    const Constructor = recognitionConstructor();
    if (!Constructor) { callbacks.onStatus("unsupported", "当前浏览器不支持语音输入"); return; }
    const recognition = new Constructor();
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
      callbacks.onTranscript(`${finalText}${interimText}`.trim());
    };
    recognition.onerror = (event) => {
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      callbacks.onStatus(denied ? "permission_denied" : "error", denied ? "没有获得麦克风权限，仍可使用文字输入" : "这次没有听清，可以再试一次");
    };
    recognition.onend = () => {
      if (this.active === recognition) this.active = null;
      callbacks.onStatus("idle");
    };
    callbacks.onStatus("listening");
    try { recognition.start(); }
    catch { callbacks.onStatus("error", "语音输入暂时无法启动"); }
  }

  stop(): void { this.active?.stop(); }
  cancel(): void { this.active?.abort(); this.active = null; }
}
