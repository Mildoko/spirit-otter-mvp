import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentIdV1, SoundscapePolicyV1 } from "@otter/shared";
import { AudioDirector } from "./audio-director";
import type { AudioSettingsV1, AudioSnapshot, ClientSfxId } from "./types";

interface AudioContextValue extends AudioSnapshot {
  unlock(): Promise<void>;
  toggleMaster(): void;
  updateSettings(settings: AudioSettingsV1): void;
  speak(request: { id: string; text: string; agentId: AgentIdV1; profileId: string }): void;
  replay(request: { id: string; text: string; agentId: AgentIdV1; profileId: string }): void;
  cancelSpeech(): void;
  setWorldView(view: "horizon" | "sky"): void;
  applySoundscapePolicy(policy: SoundscapePolicyV1): void;
  playSfx(id: ClientSfxId): void;
}

const AudioContextValue = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [director] = useState(() => new AudioDirector());
  const [snapshot, setSnapshot] = useState(() => director.getSnapshot());

  useEffect(() => {
    const update = () => setSnapshot(director.getSnapshot());
    const unsubscribe = director.subscribe(update);
    const visibility = () => director.handleVisibilityChange(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      director.dispose();
    };
  }, [director]);

  const value = useMemo<AudioContextValue>(() => ({
    ...snapshot,
    unlock: () => director.unlock(),
    toggleMaster: () => director.toggleMaster(),
    updateSettings: (settings) => director.updateSettings(settings),
    speak: (request) => director.speak(request),
    replay: (request) => director.replay(request),
    cancelSpeech: () => director.cancelSpeech(),
    setWorldView: (view) => director.setWorldView(view),
    applySoundscapePolicy: (policy) => director.applySoundscapePolicy(policy),
    playSfx: (id) => director.playSfx(id),
  }), [director, snapshot]);

  return <AudioContextValue.Provider value={value}>{children}</AudioContextValue.Provider>;
}

export function useAudio(): AudioContextValue {
  const value = useContext(AudioContextValue);
  if (!value) throw new Error("useAudio 必须在 AudioProvider 内使用");
  return value;
}
