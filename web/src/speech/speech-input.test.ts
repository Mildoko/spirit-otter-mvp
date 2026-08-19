import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSpeechInputAdapter } from "./speech-input";

afterEach(() => { Reflect.deleteProperty(globalThis, "SpeechRecognition"); });

describe("browser speech input", () => {
  it("delivers the final Chinese transcript without sending it", () => {
    class Recognition {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      start() { this.onresult?.({ results: [{ isFinal: true, 0: { transcript: "今天想聊聊" } }] }); this.onend?.(); }
      stop() {} abort() {}
    }
    Object.defineProperty(globalThis, "SpeechRecognition", { configurable: true, value: Recognition });
    const transcript = vi.fn();
    const status = vi.fn();
    new BrowserSpeechInputAdapter().start({ onTranscript: transcript, onStatus: status });
    expect(transcript).toHaveBeenCalledWith("今天想聊聊");
    expect(status).toHaveBeenCalledWith("listening");
    expect(status).toHaveBeenLastCalledWith("idle");
  });
});
