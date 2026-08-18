import type { SoundscapePolicyV1 } from "@otter/shared";
import { bgmAssets, sfxAssets } from "./assets";
import { loadAudioSettings, saveAudioSettings } from "./settings";
import { BrowserSpeechAdapter } from "./speech-adapter";
import type { AgentSpeechRequest, AudioSettingsV1, AudioSnapshot, ClientSfxId, SpeechAdapter } from "./types";
import { resolveVoiceProfile, validateVoiceProfileRegistry } from "./voice-profiles";

type WorldView = "horizon" | "sky";
type Listener = () => void;

interface BgmTrack {
  audio: HTMLAudioElement;
  gain: GainNode;
  source: MediaElementAudioSourceNode;
}

const audioContextConstructor = (): typeof AudioContext | undefined => {
  const audioWindow = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return globalThis.AudioContext ?? audioWindow.webkitAudioContext;
};

export class AudioDirector {
  private settings: AudioSettingsV1;
  private unlocked = false;
  private speaking = false;
  private soundscapePolicy: SoundscapePolicyV1 = "normal";
  private error: string | null = null;
  private worldView: WorldView = "horizon";
  private context: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private sfxGain: GainNode | undefined;
  private readonly bgmTracks = new Map<WorldView, BgmTrack>();
  private readonly sfxBuffers = new Map<string, AudioBuffer>();
  private readonly loadingBuffers = new Map<string, Promise<void>>();
  private readonly activeSfx = new Set<AudioBufferSourceNode>();
  private readonly lastSfxAt = new Map<ClientSfxId, number>();
  private readonly listeners = new Set<Listener>();
  private disposed = false;

  constructor(
    private readonly speech: SpeechAdapter = new BrowserSpeechAdapter(),
    settings: AudioSettingsV1 = loadAudioSettings(),
    private readonly fetchAudio: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    validateVoiceProfileRegistry();
    this.settings = { ...settings };
  }

  getSnapshot(): AudioSnapshot {
    return {
      status: !this.unlocked ? "locked" : !this.settings.masterEnabled ? "muted" : this.error ? "error" : "on",
      unlocked: this.unlocked,
      speaking: this.speaking,
      speechSupported: this.speech.isSupported(),
      settings: { ...this.settings },
      soundscapePolicy: this.soundscapePolicy,
      error: this.error,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void { for (const listener of this.listeners) listener(); }

  async unlock(): Promise<void> {
    this.disposed = false;
    this.error = null;
    this.unlocked = true;
    if (!this.context) {
      const Context = audioContextConstructor();
      if (Context) {
        try { this.createAudioGraph(new Context()); }
        catch { this.error = "背景声音暂时不可用，语音仍可继续"; }
      } else {
        this.error = "背景声音暂时不可用，语音仍可继续";
      }
    }
    try { await this.context?.resume(); }
    catch { this.error = "浏览器暂时没有允许播放声音"; }
    if (this.settings.masterEnabled) await this.startCurrentBgm();
    void this.preloadSfx();
    this.updateAllGains(0.12);
    this.notify();
  }

  private createAudioGraph(context: AudioContext): void {
    this.context = context;
    this.masterGain = context.createGain();
    this.masterGain.gain.value = this.settings.masterEnabled ? this.settings.masterVolume : 0;
    this.masterGain.connect(context.destination);
    this.sfxGain = context.createGain();
    this.sfxGain.gain.value = this.settings.sfxVolume;
    this.sfxGain.connect(this.masterGain);
    for (const view of ["horizon", "sky"] as const) {
      const audio = new Audio(bgmAssets[view]);
      audio.loop = true;
      audio.preload = "auto";
      const gain = context.createGain();
      gain.gain.value = 0;
      const source = context.createMediaElementSource(audio);
      source.connect(gain);
      gain.connect(this.masterGain);
      this.bgmTracks.set(view, { audio, gain, source });
    }
  }

  private async startCurrentBgm(): Promise<void> {
    if (!this.context || !this.settings.masterEnabled || !this.settings.bgmEnabled || this.soundscapePolicy === "silent") return;
    const track = this.bgmTracks.get(this.worldView);
    if (!track) return;
    try {
      await track.audio.play();
      this.error = null;
    } catch {
      this.error = "背景音乐未能启动，可以再次点击声音按钮重试";
    }
  }

  setWorldView(view: WorldView): void {
    if (this.worldView === view) return;
    this.worldView = view;
    if (this.unlocked) void this.startCurrentBgm().finally(() => {
      this.updateBgmGains(1);
      this.notify();
    });
  }

  applySoundscapePolicy(policy: SoundscapePolicyV1): void {
    this.soundscapePolicy = policy;
    if (policy !== "normal") this.stopAllSfx();
    this.updateBgmGains(policy === "silent" ? 0.2 : 0.5);
    this.notify();
  }

  updateSettings(next: AudioSettingsV1): void {
    const wasMasterEnabled = this.settings.masterEnabled;
    this.settings = { ...next, version: 1 };
    saveAudioSettings(this.settings);
    if (!this.settings.masterEnabled || !this.settings.voiceEnabled) this.cancelSpeech();
    if (!this.settings.sfxEnabled || !this.settings.masterEnabled) this.stopAllSfx();
    this.updateAllGains(0.15);
    if (!wasMasterEnabled && this.settings.masterEnabled && this.unlocked) {
      void this.context?.resume();
      void this.startCurrentBgm().finally(() => this.updateBgmGains(0.2));
    }
    this.notify();
  }

  toggleMaster(): void {
    if (!this.unlocked) { void this.unlock(); return; }
    this.updateSettings({ ...this.settings, masterEnabled: !this.settings.masterEnabled });
  }

  speak(request: AgentSpeechRequest): void {
    if (!this.unlocked || !this.settings.masterEnabled || !this.settings.voiceEnabled) return;
    if (!this.speech.isSupported()) {
      this.error = "当前浏览器没有可用的系统语音";
      this.notify();
      return;
    }
    this.cancelSpeech();
    const profile = resolveVoiceProfile(request.agentId, request.profileId);
    this.speech.speak({
      id: request.id,
      text: request.text,
      profile,
      volume: this.settings.masterVolume * this.settings.voiceVolume,
      onStart: () => {
        this.speaking = true;
        this.error = null;
        this.updateBgmGains(0.2);
        this.notify();
      },
      onEnd: () => {
        this.speaking = false;
        this.updateBgmGains(0.6);
        this.notify();
      },
      onError: (message) => {
        this.error = message;
        this.notify();
      },
    });
  }

  replay(request: AgentSpeechRequest): void { this.speak(request); }

  cancelSpeech(): void {
    this.speech.cancel();
    if (!this.speaking) return;
    this.speaking = false;
    this.updateBgmGains(0.25);
    this.notify();
  }

  playSfx(id: ClientSfxId): void {
    if (!this.unlocked || !this.context || !this.sfxGain || !this.settings.masterEnabled || !this.settings.sfxEnabled || this.soundscapePolicy !== "normal") return;
    const now = Date.now();
    if (now - (this.lastSfxAt.get(id) ?? 0) < 2000) return;
    const definition = sfxAssets[id];
    const buffer = this.sfxBuffers.get(definition.url);
    if (!buffer) { void this.loadSfx(definition.url).then(() => this.playSfx(id)); return; }
    const offset = Math.min(definition.offsetSeconds, Math.max(0, buffer.duration - 0.05));
    const duration = Math.min(definition.durationSeconds, Math.max(0.05, buffer.duration - offset));
    const source = this.context.createBufferSource();
    const localGain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = definition.playbackRate;
    localGain.gain.value = definition.gain;
    source.connect(localGain);
    localGain.connect(this.sfxGain);
    source.onended = () => {
      this.activeSfx.delete(source);
      source.disconnect();
      localGain.disconnect();
    };
    this.lastSfxAt.set(id, now);
    this.activeSfx.add(source);
    source.start(0, offset, duration);
  }

  private async preloadSfx(): Promise<void> {
    const urls = [...new Set(Object.values(sfxAssets).map((asset) => asset.url))];
    await Promise.allSettled(urls.map((url) => this.loadSfx(url)));
  }

  private loadSfx(url: string): Promise<void> {
    if (this.sfxBuffers.has(url)) return Promise.resolve();
    const existing = this.loadingBuffers.get(url);
    if (existing) return existing;
    const loading = (async () => {
      if (!this.context) return;
      const response = await this.fetchAudio(url);
      if (!response.ok) throw new Error(`音效加载失败：${response.status}`);
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.sfxBuffers.set(url, buffer);
    })().catch(() => {
      this.error ??= "部分环境音暂时不可用";
      this.notify();
    }).finally(() => this.loadingBuffers.delete(url));
    this.loadingBuffers.set(url, loading);
    return loading;
  }

  private stopAllSfx(): void {
    for (const source of this.activeSfx) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSfx.clear();
  }

  private updateAllGains(durationSeconds: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.settings.masterEnabled ? this.settings.masterVolume : 0, now + durationSeconds);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.cancelScheduledValues(now);
      this.sfxGain.gain.linearRampToValueAtTime(this.settings.sfxEnabled ? this.settings.sfxVolume : 0, now + durationSeconds);
    }
    this.updateBgmGains(durationSeconds);
  }

  private updateBgmGains(durationSeconds: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const policyFactor = this.soundscapePolicy === "silent" ? 0 : this.soundscapePolicy === "reduced" ? 0.2 : 1;
    const speechFactor = this.speaking ? 0.3 : 1;
    const enabled = this.settings.masterEnabled && this.settings.bgmEnabled;
    for (const [view, track] of this.bgmTracks) {
      const target = enabled && view === this.worldView ? this.settings.bgmVolume * policyFactor * speechFactor : 0;
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.linearRampToValueAtTime(target, now + durationSeconds);
    }
  }

  handleVisibilityChange(visible: boolean): void {
    if (!visible) {
      for (const track of this.bgmTracks.values()) track.audio.pause();
      return;
    }
    if (this.unlocked && this.settings.masterEnabled) void this.startCurrentBgm().finally(() => this.updateBgmGains(0.4));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelSpeech();
    this.stopAllSfx();
    for (const track of this.bgmTracks.values()) {
      track.audio.pause();
      track.source.disconnect();
      track.gain.disconnect();
    }
    this.bgmTracks.clear();
    this.sfxBuffers.clear();
    this.loadingBuffers.clear();
    void this.context?.close();
    this.context = undefined;
    this.masterGain = undefined;
    this.sfxGain = undefined;
    this.unlocked = false;
    this.speaking = false;
    this.speech.dispose();
    this.notify();
  }
}
