import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../../src/config/env.js";
import { AzureSpeechService } from "../../src/services/azure-speech-service.js";

const base = { DATABASE_URL: "postgresql://unused/unused", SESSION_SECRET: "a-secret-with-at-least-thirty-two-characters", NODE_ENV: "test" } as const;

describe("Azure tata speech service", () => {
  it("uses Xiaoxiao with a safe profile style and caches identical audio", async () => {
    const env = loadEnv({ ...base, AZURE_SPEECH_KEY: "secret", AZURE_SPEECH_REGION: "eastasia", AZURE_SPEECH_VOICE: "zh-CN-XiaoxiaoNeural" });
    const request = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const service = new AzureSpeechService(env, request as unknown as typeof fetch);
    const text = `回来啦-${Date.now()}`;
    expect(await service.synthesize(text, "tata.welcome")).toEqual(Buffer.from([1, 2, 3]));
    await service.synthesize(text, "tata.welcome");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toContain("eastasia.tts.speech.microsoft.com");
    expect(String(options?.body)).toContain("zh-CN-XiaoxiaoNeural");
    expect(String(options?.body)).toContain("cheerful");
  });

  it("fails closed when cloud credentials are absent", async () => {
    const service = new AzureSpeechService(loadEnv(base));
    await expect(service.synthesize("你好", "tata.welcome")).rejects.toMatchObject({ code: "CLOUD_TTS_UNAVAILABLE" });
  });
});
