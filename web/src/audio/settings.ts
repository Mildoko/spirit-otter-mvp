import type { AudioSettingsV1 } from "./types";

export const AUDIO_SETTINGS_STORAGE_KEY = "otter-audio-settings-v1";

export const defaultAudioSettings: AudioSettingsV1 = {
  version: 1,
  masterEnabled: true,
  voiceEnabled: true,
  bgmEnabled: true,
  sfxEnabled: true,
  masterVolume: 0.8,
  voiceVolume: 1,
  bgmVolume: 0.25,
  sfxVolume: 0.35,
};

const finiteVolume = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function parseAudioSettings(raw: string | null): AudioSettingsV1 {
  if (!raw) return { ...defaultAudioSettings };
  try {
    const value = JSON.parse(raw) as Partial<AudioSettingsV1>;
    if (value.version !== 1) return { ...defaultAudioSettings };
    return {
      version: 1,
      masterEnabled: typeof value.masterEnabled === "boolean" ? value.masterEnabled : true,
      voiceEnabled: typeof value.voiceEnabled === "boolean" ? value.voiceEnabled : true,
      bgmEnabled: typeof value.bgmEnabled === "boolean" ? value.bgmEnabled : true,
      sfxEnabled: typeof value.sfxEnabled === "boolean" ? value.sfxEnabled : true,
      masterVolume: finiteVolume(value.masterVolume, defaultAudioSettings.masterVolume),
      voiceVolume: finiteVolume(value.voiceVolume, defaultAudioSettings.voiceVolume),
      bgmVolume: finiteVolume(value.bgmVolume, defaultAudioSettings.bgmVolume),
      sfxVolume: finiteVolume(value.sfxVolume, defaultAudioSettings.sfxVolume),
    };
  } catch {
    return { ...defaultAudioSettings };
  }
}

export function loadAudioSettings(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): AudioSettingsV1 {
  try { return parseAudioSettings(storage?.getItem(AUDIO_SETTINGS_STORAGE_KEY) ?? null); }
  catch { return { ...defaultAudioSettings }; }
}

export function saveAudioSettings(settings: AudioSettingsV1, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  try { storage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Storage may be disabled; sound continues for the current page. */ }
}
