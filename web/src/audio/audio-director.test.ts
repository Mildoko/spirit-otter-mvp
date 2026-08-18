import { describe, expect, it, vi } from "vitest";
import { AudioDirector } from "./audio-director";
import { defaultAudioSettings } from "./settings";
import type { SpeechAdapter, SpeechRequest } from "./types";

function fakeSpeechAdapter() {
  let active: SpeechRequest | undefined;
  const adapter: SpeechAdapter = {
    speak: vi.fn((request: SpeechRequest) => { active = request; request.onStart?.(); return { cancel: () => adapter.cancel() }; }),
    cancel: vi.fn(() => { active = undefined; }),
    isSupported: () => true,
    dispose: vi.fn(),
  };
  return { adapter, active: () => active };
}

describe("audio director", () => {
  it("stays locked until explicit unlock and cancels before a replacement speech", async () => {
    const speech = fakeSpeechAdapter();
    const director = new AudioDirector(speech.adapter, { ...defaultAudioSettings }, vi.fn() as unknown as typeof fetch);
    expect(director.getSnapshot().status).toBe("locked");
    director.speak({ id: "ignored", text: "不会播放", agentId: "spirit_otter", profileId: "spirit_otter.deep_tide" });
    expect(speech.adapter.speak).not.toHaveBeenCalled();
    await director.unlock();
    director.speak({ id: "one", text: "第一句", agentId: "spirit_otter", profileId: "spirit_otter.deep_tide" });
    director.speak({ id: "two", text: "第二句", agentId: "spirit_otter", profileId: "spirit_otter.shore_pick" });
    expect(speech.adapter.speak).toHaveBeenCalledTimes(2);
    expect(speech.adapter.cancel).toHaveBeenCalledTimes(2);
    expect(speech.active()?.id).toBe("two");
  });

  it("applies safety policy and voice settings without blocking text state", async () => {
    const speech = fakeSpeechAdapter();
    const director = new AudioDirector(speech.adapter, { ...defaultAudioSettings }, vi.fn() as unknown as typeof fetch);
    await director.unlock();
    director.applySoundscapePolicy("silent");
    director.speak({ id: "safe", text: "现在先确认安全", agentId: "spirit_otter", profileId: "spirit_otter.safety_plain" });
    expect(speech.active()?.profile.id).toBe("spirit_otter.safety_plain");
    expect(director.getSnapshot().soundscapePolicy).toBe("silent");
    director.updateSettings({ ...director.getSnapshot().settings, voiceEnabled: false });
    expect(speech.adapter.cancel).toHaveBeenCalled();
  });

  it("mutes and restores the master setting", async () => {
    const speech = fakeSpeechAdapter();
    const director = new AudioDirector(speech.adapter, { ...defaultAudioSettings }, vi.fn() as unknown as typeof fetch);
    await director.unlock();
    director.toggleMaster();
    expect(director.getSnapshot()).toMatchObject({ status: "muted", settings: { masterEnabled: false } });
    director.toggleMaster();
    expect(director.getSnapshot().settings.masterEnabled).toBe(true);
  });
});
