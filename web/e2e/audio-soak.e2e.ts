import { expect, test, type Page } from "@playwright/test";

interface AudioSoakProbe {
  audioContexts: number;
  mediaPlayCalls: number;
  mediaPlayErrors: number;
  speechStarts: number;
  speechEnds: number;
  speechCancels: number;
  activeSpeech: number;
  maxActiveSpeech: number;
}

const soakEnabled = process.env.E2E_AUDIO_SOAK === "1";
const soakDurationMs = Number(process.env.E2E_AUDIO_SOAK_MS ?? 30 * 60 * 1000);
const actionIntervalMs = Math.min(30_000, Math.max(1_000, Math.floor(soakDurationMs / 4)));

test.skip(process.env.E2E_MODE !== "demo" || !soakEnabled, "仅在显式开启声音稳定性测试时运行");

async function installAudioSoakProbes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: AudioSoakProbe = {
      audioContexts: 0,
      mediaPlayCalls: 0,
      mediaPlayErrors: 0,
      speechStarts: 0,
      speechEnds: 0,
      speechCancels: 0,
      activeSpeech: 0,
      maxActiveSpeech: 0,
    };
    Object.defineProperty(window, "__otterAudioSoak", { configurable: true, value: probe });

    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
      onend: ((event: SpeechSynthesisEvent) => void) | null = null;
      onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    const voice = { name: "Microsoft Xiaoxiao", lang: "zh-CN", localService: true, default: true, voiceURI: "soak-zh" } as SpeechSynthesisVoice;
    let generation = 0;
    let current: FakeUtterance | null = null;
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance: FakeUtterance) => {
        const ownGeneration = ++generation;
        current = utterance;
        queueMicrotask(() => {
          if (generation !== ownGeneration || current !== utterance) return;
          probe.activeSpeech = 1;
          probe.maxActiveSpeech = Math.max(probe.maxActiveSpeech, probe.activeSpeech);
          probe.speechStarts += 1;
          utterance.onstart?.({} as SpeechSynthesisEvent);
        });
        window.setTimeout(() => {
          if (generation !== ownGeneration || current !== utterance) return;
          current = null;
          probe.activeSpeech = 0;
          probe.speechEnds += 1;
          utterance.onend?.({} as SpeechSynthesisEvent);
        }, 250);
      },
      cancel: () => {
        generation += 1;
        current = null;
        probe.activeSpeech = 0;
        probe.speechCancels += 1;
      },
      pause() {}, resume() {}, pending: false, speaking: false, paused: false,
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
      onvoiceschanged: null,
    } as unknown as SpeechSynthesis;
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
  });
}

async function installRuntimeAudioProbes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __otterAudioSoak: AudioSoakProbe }).__otterAudioSoak;
    const NativeAudioContext = window.AudioContext;
    if (NativeAudioContext) {
      const CountingAudioContext = new Proxy(NativeAudioContext, {
        construct(target, args) {
          probe.audioContexts += 1;
          return Reflect.construct(target, args);
        },
      });
      Object.defineProperty(window, "AudioContext", { configurable: true, value: CountingAudioContext });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: CountingAudioContext });
    }
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function play() {
        probe.mediaPlayCalls += 1;
        return Promise.resolve();
      },
    });
  });
}

test("声音引擎持续运行 30 分钟不重复创建上下文或叠加语音", async ({ page }) => {
  test.setTimeout(soakDurationMs + 180_000);
  page.setDefaultTimeout(15_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/runtime")) console.log(`[audio-soak-runtime-response] ${await response.text()}`);
  });
  await installAudioSoakProbes(page);
  await page.request.delete("/api/me/data");
  await page.goto("/");
  const runtimeResponse = await page.request.get("/api/runtime");
  const runtime = await runtimeResponse.json() as { audioV1Enabled?: boolean };
  expect(runtime.audioV1Enabled).toBe(true);
  const browserRuntime = await page.evaluate(() => fetch("/api/runtime").then((response) => response.json())) as { audioV1Enabled?: boolean };
  expect(browserRuntime.audioV1Enabled).toBe(true);
  console.log(`[audio-soak-start] ${JSON.stringify({ url: page.url(), runtime: browserRuntime, soundButtons: await page.locator(".sound-button").count(), pageErrors })}`);
  const enableSound = page.getByRole("button", { name: "开启声音" });
  await expect(enableSound).toBeVisible({ timeout: 15_000 });
  await installRuntimeAudioProbes(page);
  await enableSound.click();
  console.log("[audio-soak-step] sound-unlocked");
  await page.getByRole("button", { name: "靠近灵体水獭并打开对话" }).click();
  console.log("[audio-soak-step] dialog-open");
  await page.locator(".composer textarea").fill("今天有点累，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  console.log("[audio-soak-step] first-reply");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioSoak: { audioContexts: number } }).__otterAudioSoak.audioContexts)).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const readMetric = async (name: string) => {
    const result = await cdp.send("Performance.getMetrics") as { metrics: Array<{ name: string; value: number }> };
    return result.metrics.find((metric) => metric.name === name)?.value ?? 0;
  };
  const initialHeap = await readMetric("JSHeapUsedSize");
  const initialNodes = await readMetric("Nodes");
  let peakHeap = initialHeap;
  let rounds = 0;
  const startedAt = Date.now();

  while (Date.now() - startedAt < soakDurationMs) {
    const toSky = rounds % 2 === 0;
    await page.getByRole("button", { name: "收起对话" }).click();
    await page.getByRole("button", { name: toSky ? "仰望星空" : "返回水面" }).click();
    await page.getByRole("button", { name: "靠近灵体水獭并打开对话" }).click();
    await page.getByRole("button", { name: "重播这条水獭回复" }).click();
    if (rounds > 0 && rounds % 10 === 0) {
      await page.getByRole("button", { name: "静音" }).click();
      await page.getByRole("button", { name: "恢复声音" }).click();
    }
    rounds += 1;
    const remaining = soakDurationMs - (Date.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(Math.min(actionIntervalMs, remaining));
    const probe = await page.evaluate(() => (window as unknown as { __otterAudioSoak: AudioSoakProbe }).__otterAudioSoak);
    expect(probe.audioContexts).toBe(1);
    expect(probe.maxActiveSpeech).toBeLessThanOrEqual(1);
    peakHeap = Math.max(peakHeap, await readMetric("JSHeapUsedSize"));
  }

  await cdp.send("HeapProfiler.collectGarbage");
  const finalHeap = await readMetric("JSHeapUsedSize");
  const finalNodes = await readMetric("Nodes");
  const probe = await page.evaluate(() => (window as unknown as { __otterAudioSoak: AudioSoakProbe }).__otterAudioSoak);
  const summary = {
    durationMs: Date.now() - startedAt,
    rounds,
    ...probe,
    initialHeap,
    peakHeap,
    finalHeap,
    heapGrowth: finalHeap - initialHeap,
    initialNodes,
    finalNodes,
    nodeGrowth: finalNodes - initialNodes,
  };
  console.log(`[audio-soak] ${JSON.stringify(summary)}`);
  expect(pageErrors).toEqual([]);
  expect(probe.audioContexts).toBe(1);
  expect(probe.maxActiveSpeech).toBeLessThanOrEqual(1);
  expect(probe.speechStarts).toBeGreaterThanOrEqual(rounds);
  expect(probe.mediaPlayCalls).toBeGreaterThanOrEqual(rounds);
  expect(finalHeap - initialHeap).toBeLessThan(48 * 1024 * 1024);
  expect(finalNodes - initialNodes).toBeLessThan(1_500);
});
