import { describe, expect, it } from "vitest";
import { AUDIO_SETTINGS_STORAGE_KEY, defaultAudioSettings, loadAudioSettings, parseAudioSettings, saveAudioSettings } from "./settings";

describe("audio settings", () => {
  it("falls back for missing, invalid, and outdated settings", () => {
    expect(parseAudioSettings(null)).toEqual(defaultAudioSettings);
    expect(parseAudioSettings("not-json")).toEqual(defaultAudioSettings);
    expect(parseAudioSettings('{"version":2}')).toEqual(defaultAudioSettings);
  });

  it("clamps volume and fills missing fields", () => {
    expect(parseAudioSettings(JSON.stringify({ version: 1, masterVolume: 2, voiceVolume: -1 }))).toMatchObject({
      masterVolume: 1, voiceVolume: 0, bgmVolume: 0.25, masterEnabled: true,
    });
  });

  it("loads and saves through the versioned key", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const next = { ...defaultAudioSettings, bgmEnabled: false };
    saveAudioSettings(next, storage);
    expect(values.has(AUDIO_SETTINGS_STORAGE_KEY)).toBe(true);
    expect(loadAudioSettings(storage)).toEqual(next);
  });
});
