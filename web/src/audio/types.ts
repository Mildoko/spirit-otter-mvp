import type { AgentIdV1, AudioSfxV1, SoundscapePolicyV1 } from "@otter/shared";

export type AudioStatus = "locked" | "on" | "muted" | "error";
export type ClientSfxId = Exclude<AudioSfxV1, "none"> | "notice_soft" | "approach_water" | "withdraw_water";

export interface AudioSettingsV1 {
  version: 1;
  masterEnabled: boolean;
  voiceEnabled: boolean;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  masterVolume: number;
  voiceVolume: number;
  bgmVolume: number;
  sfxVolume: number;
}

export interface VoiceProfileV1 {
  id: string;
  agentId: AgentIdV1;
  locale: "zh-CN";
  rate: number;
  pitch: number;
  preferredVoiceNames: readonly string[];
}

export interface SpeechRequest {
  id: string;
  text: string;
  profile: VoiceProfileV1;
  volume: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

export interface SpeechHandle {
  cancel(): void;
}

export interface SpeechAdapter {
  speak(request: SpeechRequest): SpeechHandle;
  cancel(): void;
  isSupported(): boolean;
  dispose(): void;
}

export interface AgentSpeechRequest {
  id: string;
  text: string;
  agentId: AgentIdV1;
  profileId: string;
}

export interface AudioSnapshot {
  status: AudioStatus;
  unlocked: boolean;
  speaking: boolean;
  speechSupported: boolean;
  settings: AudioSettingsV1;
  soundscapePolicy: SoundscapePolicyV1;
  error: string | null;
}
