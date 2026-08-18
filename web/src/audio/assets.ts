import bgmHorizonUrl from "../assets/audio-v1/bgm-horizon-temp.mp3";
import bgmSkyUrl from "../assets/audio-v1/bgm-sky-temp.mp3";
import inviteChimeUrl from "../assets/audio-v1/sfx-invite-chime-temp.mp3";
import noticeSoftUrl from "../assets/audio-v1/sfx-notice-soft-temp.mp3";
import replyRippleUrl from "../assets/audio-v1/sfx-reply-ripple-temp.mp3";
import waterRipplesUrl from "../assets/audio-v1/sfx-water-ripples-source.mp3";
import type { ClientSfxId } from "./types";

export const bgmAssets = { horizon: bgmHorizonUrl, sky: bgmSkyUrl } as const;

export interface SfxAssetDefinition {
  url: string;
  offsetSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  gain: number;
}

export const sfxAssets: Record<ClientSfxId, SfxAssetDefinition> = {
  reply_ripple: { url: replyRippleUrl, offsetSeconds: 0, durationSeconds: 2, playbackRate: 1, gain: 0.72 },
  invite_chime: { url: inviteChimeUrl, offsetSeconds: 0, durationSeconds: 4, playbackRate: 1, gain: 0.62 },
  notice_soft: { url: noticeSoftUrl, offsetSeconds: 0, durationSeconds: 5, playbackRate: 0.96, gain: 0.5 },
  approach_water: { url: waterRipplesUrl, offsetSeconds: 0.4, durationSeconds: 2.4, playbackRate: 0.96, gain: 0.58 },
  withdraw_water: { url: waterRipplesUrl, offsetSeconds: 5.2, durationSeconds: 2.4, playbackRate: 0.88, gain: 0.42 },
};
