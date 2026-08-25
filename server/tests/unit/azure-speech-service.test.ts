import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { AzureSpeechService } from "../../src/services/azure-speech-service.js";

const base = { DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", NODE_ENV: "test" } as const;

describe("Azure public-agent speech service", () => {
  it("uses Yunjian with a slow low narration style for 鹿禅 and caches identical audio", async () => {
    const env = loadEnv({ ...base, AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "eastasia", AZURE_SPEECH_VOICE_LUCHAN: "zh-CN-YunjianNeural" });
    const request = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const service = new AzureSpeechService(env, request as unknown as typeof fetch);
    const text = `回来啦-${Date.now()}`;
    expect(await service.synthesize(text, "zen_deer.welcome")).toEqual(Buffer.from([1, 2, 3]));
    await service.synthesize(text, "zen_deer.welcome");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toContain("eastasia.tts.speech.microsoft.com");
    expect(String(options?.body)).toContain("zh-CN-YunjianNeural");
    expect(String(options?.body)).toContain("narration-relaxed");
    expect(String(options?.body)).toContain('rate="-10%"');
    expect(String(options?.body)).toContain('pitch="-6%"');
  });

  it.each([
    ["tata", "spirit_otter.welcome", "zh-CN-XiaoxiaoNeural", "friendly", '-7%', '+1%'],
    ["飞儿", "bird_courier.recommendation", "zh-CN-XiaoyiNeural", "cheerful", '+4%', '+2%'],
  ] as const)("uses the distinct %s cloud voice pack", async (_name, profileId, voice, style, rate, pitch) => {
    const env = loadEnv({ ...base, AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "eastasia" });
    const request = vi.fn(async () => new Response(new Uint8Array([4, 5, 6]), { status: 200 }));
    const service = new AzureSpeechService(env, request as unknown as typeof fetch);
    await service.synthesize(`${profileId}-${Date.now()}`, profileId);
    const body = String(request.mock.calls[0]![1]?.body);
    expect(body).toContain(voice);
    expect(body).toContain(`style="${style}"`);
    expect(body).toContain(`rate="${rate}"`);
    expect(body).toContain(`pitch="${pitch}"`);
  });

  it("keeps legacy 鹿禅 voice profile IDs mapped to 鹿禅 instead of tata", async () => {
    const env = loadEnv({ ...base, AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "eastasia" });
    const request = vi.fn(async () => new Response(new Uint8Array([7]), { status: 200 }));
    const service = new AzureSpeechService(env, request as unknown as typeof fetch);
    await service.synthesize(`legacy-${Date.now()}`, "spirit_otter.deep_tide");
    expect(String(request.mock.calls[0]![1]?.body)).toContain("zh-CN-YunjianNeural");
  });

  it("fails closed when cloud credentials are absent", async () => {
    const service = new AzureSpeechService(loadEnv(base));
    await expect(service.synthesize("你好", "zen_deer.welcome")).rejects.toMatchObject({ code: "CLOUD_TTS_UNAVAILABLE" });
  });
});
