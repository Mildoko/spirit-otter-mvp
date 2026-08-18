import { describe, expect, it, vi } from "vitest";
import { BrowserSpeechAdapter, chooseChineseVoice } from "./speech-adapter";
import { resolveVoiceProfile } from "./voice-profiles";

const voice = (name: string, lang: string, localService = true, isDefault = false) => ({ name, lang, localService, default: isDefault, voiceURI: name }) as SpeechSynthesisVoice;

describe("browser speech adapter", () => {
  it("prefers the configured zh-CN voice", () => {
    const voices = [voice("English", "en-US"), voice("Microsoft Xiaoxiao", "zh-CN", false), voice("中文本地", "zh-CN")];
    expect(chooseChineseVoice(voices, resolveVoiceProfile("spirit_otter", "spirit_otter.deep_tide"))?.name).toContain("Xiaoxiao");
  });

  it("sets prosody, fires lifecycle callbacks, and cancels the previous speech", () => {
    let current: SpeechSynthesisUtterance | undefined;
    const synthesis = {
      getVoices: () => [voice("中文本地", "zh-CN")],
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => { current = utterance; utterance.onstart?.({} as SpeechSynthesisEvent); }),
      cancel: vi.fn(),
    } as unknown as SpeechSynthesis;
    const utterances: SpeechSynthesisUtterance[] = [];
    const adapter = new BrowserSpeechAdapter(synthesis, (text) => {
      const utterance = { text } as SpeechSynthesisUtterance;
      utterances.push(utterance);
      return utterance;
    });
    const onStart = vi.fn();
    const onEnd = vi.fn();
    adapter.speak({ id: "one", text: "你好", profile: resolveVoiceProfile("spirit_otter", "spirit_otter.deep_tide"), volume: 0.8, onStart, onEnd });
    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(utterances[0]).toMatchObject({ lang: "zh-CN", rate: 0.92, pitch: 0.96, volume: 0.8 });
    expect(onStart).toHaveBeenCalledOnce();
    current?.onend?.({} as SpeechSynthesisEvent);
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
