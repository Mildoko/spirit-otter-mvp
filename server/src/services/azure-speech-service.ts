import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import type { AgentIdV1 } from "@otter/shared";

const cache = new Map<string, Buffer>();
const maxCacheEntries = 128;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface CloudVoiceProfile {
  agentId: AgentIdV1;
  publicName: "鹿禅" | "tata" | "飞儿";
  voice: string;
  style: string;
  rate: string;
  pitch: string;
}

function resolveProfile(env: AppEnv, profileId: string): CloudVoiceProfile {
  const legacyLuchanProfile = profileId === "spirit_otter.deep_tide" || profileId === "spirit_otter.shore_pick";
  if (legacyLuchanProfile) {
    profileId = profileId.replace("spirit_otter.", "zen_deer.");
  }
  if (profileId.startsWith("spirit_otter.") || profileId === "tata.welcome") {
    return {
      agentId: "spirit_otter",
      publicName: "tata",
      voice: env.AZURE_SPEECH_VOICE_TATA,
      style: profileId.includes("safety_plain") ? "serious" : profileId.includes("welcome") || profileId.includes("caring_clear") ? "friendly" : "gentle",
      rate: profileId.includes("safety_plain") ? "-2%" : profileId.includes("caring_clear") ? "-2%" : "-7%",
      pitch: profileId.includes("welcome") ? "+1%" : "0%",
    };
  }
  if (profileId.startsWith("bird_courier.")) {
    return {
      agentId: "bird_courier",
      publicName: "飞儿",
      voice: env.AZURE_SPEECH_VOICE_FEIER,
      style: profileId.includes("safety_plain") || profileId.includes("concierge") ? "serious" : "cheerful",
      rate: profileId.includes("recommendation") ? "+4%" : profileId.includes("welcome") ? "+2%" : "0%",
      pitch: profileId.includes("safety_plain") ? "0%" : "+2%",
    };
  }
  const welcome = profileId.includes("welcome");
  const focused = profileId.includes("shore_pick");
  const safety = profileId.includes("safety_plain");
  return {
    agentId: "zen_deer",
    publicName: "鹿禅",
    voice: env.AZURE_SPEECH_VOICE_LUCHAN || env.AZURE_SPEECH_VOICE,
    style: focused || safety ? "serious" : "narration-relaxed",
    rate: welcome ? "-10%" : focused ? "-8%" : safety ? "-5%" : "-14%",
    pitch: welcome ? "-6%" : focused ? "-8%" : safety ? "-4%" : "-10%",
  };
}

export class AzureSpeechService {
  constructor(private readonly env: AppEnv, private readonly request: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  get configured(): boolean { return Boolean(this.env.AZURE_SPEECH_KEY && this.env.AZURE_SPEECH_REGION); }

  async synthesize(text: string, profileId: string): Promise<Buffer> {
    if (!this.configured) throw Object.assign(new Error("云端语音尚未配置"), { statusCode: 503, code: "CLOUD_TTS_UNAVAILABLE" });
    const profile = resolveProfile(this.env, profileId);
    const key = createHash("sha256").update(`${profile.voice}\0${profile.style}\0${profile.rate}\0${profile.pitch}\0${text}`).digest("hex");
    const cached = cache.get(key);
    if (cached) return cached;
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${escapeXml(profile.voice)}"><mstts:express-as style="${profile.style}" styledegree="0.85"><prosody rate="${profile.rate}" pitch="${profile.pitch}">${escapeXml(text)}</prosody></mstts:express-as></voice></speak>`;
    const response = await this.request(`https://${this.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.env.AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "boonzoom-agents",
      },
      body: ssml,
    });
    if (!response.ok) throw Object.assign(new Error(`${profile.publicName}的云端声音暂时不可用`), { statusCode: 502, code: "CLOUD_TTS_FAILED" });
    const audio = Buffer.from(await response.arrayBuffer());
    if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value ?? "");
    cache.set(key, audio);
    return audio;
  }
}
