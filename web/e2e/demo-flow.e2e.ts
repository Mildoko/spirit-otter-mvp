import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

async function installAudioStubs(page: Page) {
  await page.addInitScript(() => {
    type AudioEvent = { type: string; text?: string; rate?: number; pitch?: number; src?: string };
    const stored = window.sessionStorage.getItem("otter-e2e-audio-events");
    const events: AudioEvent[] = stored ? JSON.parse(stored) : [];
    const record = (event: AudioEvent) => {
      events.push(event);
      window.sessionStorage.setItem("otter-e2e-audio-events", JSON.stringify(events));
    };
    Object.defineProperty(window, "__otterAudioEvents", { configurable: true, value: events });
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
    const voice = { name: "Microsoft Xiaoxiao", lang: "zh-CN", localService: true, default: true, voiceURI: "e2e-zh" } as SpeechSynthesisVoice;
    const synthesis = {
      getVoices: () => [voice],
      speak: (utterance: FakeUtterance) => {
        record({ type: "speak", text: utterance.text, rate: utterance.rate, pitch: utterance.pitch });
        queueMicrotask(() => utterance.onstart?.({} as SpeechSynthesisEvent));
      },
      cancel: () => record({ type: "cancel" }),
      pause() {}, resume() {}, pending: false, speaking: false, paused: false,
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
      onvoiceschanged: null,
    } as unknown as SpeechSynthesis;
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function () { record({ type: "media-play", src: (this as HTMLMediaElement).currentSrc || (this as HTMLMediaElement).src }); return Promise.resolve(); },
    });
  });
}

test("演示模式完成深汐、自动混合、拾岸、行动和安全退场", async ({ page }) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  await expect(page.getByText("本地演示，不保存数据")).toBeVisible();
  await expect(page.getByRole("region", { name: "灵体水面世界" })).toBeVisible();
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await expect(page.getByRole("region", { name: "与 tata 的对话" })).toBeVisible();

  await page.locator(".composer textarea").fill("事情都堆在一起，我不知道先做哪个，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  const firstOpening = ((await page.locator(".message-assistant").last().innerText()).split(/[，。！？]/u)[0] ?? "").trim();

  await page.locator(".composer textarea").fill("请帮我整理手上的任务。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText(/角色路由：shore_pick/)).toBeVisible();
  await expect(page.getByText("帮我整理", { exact: true })).toHaveCount(0);
  const secondOpening = ((await page.locator(".message-assistant").last().innerText()).split(/[，。！？]/u)[0] ?? "").trim();
  expect(secondOpening).not.toBe(firstOpening);
  await page.locator(".composer textarea").fill("先写明天汇报的标题。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("捞起的一件事")).toBeVisible();
  await page.getByRole("button", { name: "确认这一小步" }).click();
  await expect(page.getByText("行动已确认")).toBeVisible();

  await page.locator(".composer textarea").fill("这些步骤让我更烦了，先停下来。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toContainText("步骤收起来");

  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect(page.locator(".character-panel img")).toHaveCount(0);
  await expect(page.locator(".emotion-diagnostics")).toHaveCount(0);
});

test("情绪推测可纠正并在同一浏览器刷新后恢复", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await page.locator(".composer textarea").fill("我很生气。");
  await page.getByRole("button", { name: "发送消息" }).click();
  const interpretation = page.getByRole("region", { name: "tata 的情绪推测" });
  await expect(interpretation).toContainText("愤怒");
  await expect(page.getByRole("region", { name: "与 tata 的对话" }).getByRole("region", { name: "tata 的情绪推测" })).toHaveCount(0);
  const box = await interpretation.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((box!.x + box!.width / 2) - viewport!.width / 2)).toBeLessThan(3);
  expect(box!.y).toBeLessThan(140);
  await page.getByRole("button", { name: "不准确" }).click();
  await page.getByRole("button", { name: "失望" }).click();
  await page.getByRole("button", { name: "采用这些词" }).click();
  await expect(page.getByRole("region", { name: "tata 的情绪推测" })).toContainText("已按你的纠正");
  await expect(page.getByRole("region", { name: "tata 的情绪推测" })).toContainText("失望");
  await page.reload();
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await expect(page.getByRole("region", { name: "tata 的情绪推测" })).toContainText("失望");
});

test("场景可切换星空、收起对话并恢复", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "仰望星空" }).click();
  await expect(page.getByRole("button", { name: "返回水面" })).toBeVisible();
  await page.getByRole("button", { name: "返回水面" }).click();
  const otterButton = page.getByRole("button", { name: "靠近 tata 并打开对话" });
  await otterButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "收起对话" }).click();
  await expect(page.getByRole("region", { name: "与 tata 的对话" })).toHaveCount(0);
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await expect(page.getByRole("region", { name: "与 tata 的对话" })).toBeVisible();
});

test("声音需明确开启，新回复朗读一次，刷新不重播并支持分项控制", async ({ page }) => {
  await installAudioStubs(page);
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "tata" })).toBeVisible();
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await expect(page.getByRole("button", { name: "静音" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents ?? []).filter((event) => event.type === "speak").length)).toBe(1);
  const welcomeSpeech = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; text?: string }> }).__otterAudioEvents.find((event) => event.type === "speak"));
  expect(welcomeSpeech?.text).toContain("tata");

  await page.locator(".composer textarea").fill("今天有点累，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents ?? []).filter((event) => event.type === "speak").length)).toBe(2);
  const spoken = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; rate?: number }> }).__otterAudioEvents.filter((event) => event.type === "speak").at(-1));
  expect(spoken?.rate).toBe(0.96);

  await page.getByRole("button", { name: "重播这条 tata 回复" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(3);

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("checkbox", { name: "场景背景音乐" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "场景背景音乐" })).not.toBeChecked();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.reload();
  const countAfterReload = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length);
  expect(countAfterReload).toBe(3);

  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(4);
  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(5);
  const safetySpeech = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; rate?: number }> }).__otterAudioEvents.filter((event) => event.type === "speak").at(-1));
  expect(safetySpeech?.rate).toBe(0.93);
});

test("语音输入只填入独立输入栏，用户确认后才发送", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = true;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        queueMicrotask(() => {
          this.onresult?.({ results: [Object.assign([{ transcript: "我想用语音和 tata 说说话" }], { isFinal: true })] });
          this.onend?.();
        });
      }
      stop() { this.onend?.(); }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "靠近 tata 并打开对话" }).click();
  await page.getByRole("button", { name: "开始语音输入" }).click();
  await expect(page.locator(".composer textarea")).toHaveValue("我想用语音和 tata 说说话");
  await expect(page.locator(".message-user")).toHaveCount(0);
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-user").last()).toContainText("我想用语音和 tata 说说话");
});

test("用户可以查看、确认、纠正、停用和删除 tata 的记忆", async ({ page }) => {
  const relation = { id: "relation-1", type: "may_trigger", sourceMemoryId: "memory-1", targetMemoryId: "memory-2", sourceContent: "明天和主管开会", targetContent: "主管表达很直接", claimState: "hypothesis", status: "active", confidence: 0.94, observedAt: new Date().toISOString() };
  let memories = [
    { schemaVersion: 2, id: "memory-1", kind: "episode", content: "明天和主管开会", claimState: "hypothesis", status: "active", observedAt: new Date().toISOString(), eventAt: new Date(Date.now() + 86_400_000).toISOString(), validFrom: new Date().toISOString(), evidence: [{ excerpt: "明天和主管开会", capturedAt: new Date().toISOString() }], relations: [relation] },
    { schemaVersion: 2, id: "memory-2", kind: "user_fact", content: "主管表达很直接", claimState: "asserted", status: "active", observedAt: new Date().toISOString(), validFrom: new Date().toISOString(), evidence: [{ excerpt: "主管表达很直接", capturedAt: new Date().toISOString() }], relations: [relation] },
  ];
  await page.route("**/api/me/memories**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: memories }) });
    const id = request.url().split("/").at(-1)!;
    if (request.method() === "DELETE") { memories = memories.filter((memory) => memory.id !== id); return route.fulfill({ status: 204 }); }
    const body = request.postDataJSON() as { action: string; content?: string };
    const memory = memories.find((item) => item.id === id)!;
    if (body.action === "confirm") memory.claimState = "confirmed";
    if (body.action === "disable") memory.status = "disabled";
    if (body.action === "correct" && body.content) memory.content = body.content;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(memory) });
  });
  await page.route("**/api/me/memory-relations/*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...relation, status: "rejected" }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("button", { name: "查看和管理记忆" }).click();
  const center = page.getByRole("dialog", { name: "tata 记得的我" });
  await expect(center).toContainText("tata 的推测");
  await expect(center).toContainText("待确认关系");
  await center.getByRole("button", { name: "这是准确的" }).click();
  await expect(center).toContainText("你已确认");
  const firstCard = center.locator(".memory-card").first();
  await firstCard.getByRole("button", { name: "纠正" }).click();
  await page.getByRole("textbox", { name: "纠正后的记忆" }).fill("后天和主管开会");
  await page.getByRole("button", { name: "保存纠正" }).click();
  await expect(center).toContainText("后天和主管开会");
  await firstCard.getByRole("button", { name: "暂不使用" }).click();
  await page.getByRole("button", { name: "已停用" }).click();
  await expect(center).toContainText("后天和主管开会");
  page.once("dialog", (dialog) => void dialog.accept());
  await center.getByRole("button", { name: "删除", exact: true }).first().click();
  await expect(center.locator(".memory-card")).toHaveCount(1);
});
