import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";

const cache = new Map<string, Buffer>();
const maxCacheEntries = 128;

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function profileStyle(profileId: string): { style: string; rate: string; pitch: string } {
  if (profileId.includes("welcome")) return { style: "cheerful", rate: "+4%", pitch: "+2%" };
  if (profileId.includes("shore_pick")) return { style: "chat-casual", rate: "+3%", pitch: "+1%" };
  if (profileId.includes("safety_plain")) return { style: "calm", rate: "-8%", pitch: "0%" };
  return { style: "gentle", rate: "-4%", pitch: "+1%" };
}

export class AzureSpeechService {
  constructor(private readonly env: AppEnv, private readonly request: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  get configured(): boolean { return Boolean(this.env.AZURE_SPEECH_KEY && this.env.AZURE_SPEECH_REGION); }

  async synthesize(text: string, profileId: string): Promise<Buffer> {
    if (!this.configured) throw Object.assign(new Error("云端语音尚未配置"), { statusCode: 503, code: "CLOUD_TTS_UNAVAILABLE" });
    const style = profileStyle(profileId);
    const key = createHash("sha256").update(`${this.env.AZURE_SPEECH_VOICE}\0${style.style}\0${text}`).digest("hex");
    const cached = cache.get(key);
    if (cached) return cached;
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${escapeXml(this.env.AZURE_SPEECH_VOICE)}"><mstts:express-as style="${style.style}" styledegree="0.85"><prosody rate="${style.rate}" pitch="${style.pitch}">${escapeXml(text)}</prosody></mstts:express-as></voice></speak>`;
    const response = await this.request(`https://${this.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.env.AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "tata-companion",
      },
      body: ssml,
    });
    if (!response.ok) throw Object.assign(new Error("tata 的云端声音暂时不可用"), { statusCode: 502, code: "CLOUD_TTS_FAILED" });
    const audio = Buffer.from(await response.arrayBuffer());
    if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value ?? "");
    cache.set(key, audio);
    return audio;
  }
}
