import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSpeechInputAdapter } from "./speech-input";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "SpeechRecognition");
  Reflect.deleteProperty(globalThis, "webkitSpeechRecognition");
});

describe("browser speech input", () => {
  it("delivers the final Chinese transcript after recognition ends", () => {
    class Recognition {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      start() {}
      stop() {
        this.onresult?.({ results: [{ isFinal: true, 0: { transcript: "今天想聊聊" } }] });
        this.onend?.();
      }
      abort() {}
    }
    Object.defineProperty(globalThis, "SpeechRecognition", { configurable: true, value: Recognition });
    const transcript = vi.fn();
    const complete = vi.fn();
    const status = vi.fn();
    const adapter = new BrowserSpeechInputAdapter();
    expect(adapter.start({ onTranscript: transcript, onComplete: complete, onStatus: status })).toBe(true);
    adapter.stop();
    expect(transcript).toHaveBeenCalledWith("今天想聊聊");
    expect(complete).toHaveBeenCalledWith("今天想聊聊");
    expect(status).toHaveBeenCalledWith("listening");
    expect(status).toHaveBeenLastCalledWith("idle");
  });

  it("reports unsupported browsers instead of silently disabling the control", () => {
    const status = vi.fn();
    const adapter = new BrowserSpeechInputAdapter();
    expect(adapter.start({ onTranscript: vi.fn(), onComplete: vi.fn(), onStatus: status })).toBe(false);
    expect(status).toHaveBeenCalledWith("unsupported", "当前浏览器不支持语音识别，请使用文字输入");
  });

  it("keeps the microphone permission error instead of reporting a false success", () => {
    class Recognition {
      lang = ""; continuous = false; interimResults = false;
      onresult = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { this.onerror?.({ error: "not-allowed" }); this.onend?.(); }
      stop() {} abort() {}
    }
    Object.defineProperty(globalThis, "SpeechRecognition", { configurable: true, value: Recognition });
    const complete = vi.fn();
    const status = vi.fn();
    new BrowserSpeechInputAdapter().start({ onTranscript: vi.fn(), onComplete: complete, onStatus: status });
    expect(complete).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith("permission_denied", "没有获得麦克风权限，请在浏览器设置中允许后重试");
  });
});
