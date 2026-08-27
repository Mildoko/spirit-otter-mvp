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

async function sendAndReadAssistantReply(page: Page, text: string): Promise<string> {
  const replies = page.locator(".message-assistant:not(.thinking)");
  const previousCount = await replies.count();
  await page.locator(".composer textarea").fill(text);
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(replies).toHaveCount(previousCount + 1);
  return replies.last().innerText();
}

async function selectAndOpenTata(page: Page): Promise<void> {
  await page.getByRole("button", { name: /(?:与|当前 Agent)tata对话/u }).click();
  await expect(page.getByRole("region", { name: /与\s*tata\s*的对话/u })).toBeVisible();
}

async function openDeerDialogue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /靠近.*鹿禅.*打开对话/u }).click();
  await expect(page.getByRole("region", { name: /与\s*鹿禅\s*的对话/u })).toBeVisible();
}

test("演示模式完成深汐、自动混合、拾岸、行动和安全退场", async ({ page }, testInfo) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  const demoDisclosure = page.getByText("本地演示，不保存数据");
  await expect(demoDisclosure).toHaveCount(1);
  if (testInfo.project.name === "desktop-chrome") await expect(demoDisclosure).toBeVisible();
  await expect(page.getByRole("region", { name: "灵体水面世界" })).toBeVisible();
  await openDeerDialogue(page);

  await page.locator(".composer textarea").fill("事情都堆在一起，我不知道先做哪个，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  const firstOpening = ((await page.locator(".message-assistant:not(.thinking) p").last().innerText()).split(/[，。！？]/u)[0] ?? "").trim();

  await page.locator(".composer textarea").fill("请帮我整理手上的任务。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  await expect(page.getByText(/角色路由：shore_pick/)).toHaveCount(0);
  await expect(page.getByText("帮我整理", { exact: true })).toHaveCount(0);
  const secondOpening = ((await page.locator(".message-assistant:not(.thinking) p").last().innerText()).split(/[，。！？]/u)[0] ?? "").trim();
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

test("鹿禅主动开题、换题并在刷新后保持带聊状态", async ({ page }) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  await openDeerDialogue(page);
  const firstReply = await sendAndReadAssistantReply(page, "我好无聊，你来开个话题");
  expect(firstReply).not.toMatch(/为什么.{0,6}无聊|无聊背后/u);
  await expect(page.locator(".composer textarea")).toHaveAttribute("placeholder", "接着聊，或者直接说“换一个”…");
  await expect(page.getByRole("region", { name: "tata 的情绪推测" })).toHaveCount(0);

  const secondReply = await sendAndReadAssistantReply(page, "换一个");
  expect(secondReply).not.toBe(firstReply);
  expect(secondReply).not.toContain("无聊");

  await page.reload();
  await openDeerDialogue(page);
  const thirdReply = await sendAndReadAssistantReply(page, "换一个");
  expect(thirdReply).not.toBe(secondReply);
  expect(thirdReply).not.toContain("无聊");
});

test("准入按钮直接解锁默认全开的声音设置", async ({ page }) => {
  await installAudioStubs(page);
  let redeemed = false;
  const bootstrap = {
    researchId: "DEMO-LOCAL", researchContact: "邀请人", aiReminder: "你正在与 AI 系统互动。",
    experiencePreferences: { deepInterpretationEnabled: true },
    conversation: { id: "demo-conversation" }, messages: [], actions: [], followups: [],
    visit: { visitId: "visit-sound", currentVisitAt: new Date().toISOString(), isReturning: false },
  };
  await page.route("**/api/session/bootstrap", (route) => redeemed
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bootstrap) })
    : route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "PREVIEW_CODE_REQUIRED", message: "请先输入本次体验码" } }) }));
  await page.route("**/api/auth/redeem-invite", (route) => {
    redeemed = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ researchId: "DEMO-LOCAL", conversationId: "demo-conversation" }) });
  });
  await page.goto("/");
  await page.getByLabel("本次体验码").fill("OTTER-PREVIEW-TEST");
  for (const checkbox of await page.locator(".consent-list input[type=checkbox]").all()) await checkbox.check();
  await page.getByRole("button", { name: "进入静水区并开启声音" }).click();
  await expect(page.getByRole("button", { name: "静音" })).toBeVisible();
  await page.getByRole("button", { name: "打开设置" }).click();
  for (const label of ["声音总开关", "Agent 回复语音", "场景背景音乐", "场景互动音效"]) {
    await expect(page.getByRole("checkbox", { name: label })).toBeChecked();
  }
});

test("主体验不再展示逐轮情绪猜测或弱打标控件", async ({ page }) => {
  await page.goto("/");
  await selectAndOpenTata(page);
  await page.locator(".composer textarea").fill("我很生气。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("region", { name: "tata 的情绪推测" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "准确" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "不准确" })).toHaveCount(0);
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("checkbox", { name: "显示情绪变化与 tata 的理解" })).toHaveCount(0);
});

test("用户可关闭主动深入并在结束聊天时选择提交或跳过疗愈反馈", async ({ page }) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  await page.getByRole("button", { name: "打开设置" }).click();
  const deepToggle = page.getByRole("checkbox", { name: /允许.*主动提出深入理解/u });
  await expect(deepToggle).toBeChecked();
  await deepToggle.uncheck();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.reload();
  await page.getByRole("button", { name: "打开设置" }).click();
  await expect(page.getByRole("checkbox", { name: /允许.*主动提出深入理解/u })).not.toBeChecked();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await selectAndOpenTata(page);
  await page.locator(".composer textarea").fill("最近工作很难，我想先说一说");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByRole("button", { name: "结束本次聊天" }).click();
  let endDialog = page.getByRole("dialog", { name: "这次聊天对你有帮助吗？" });
  await endDialog.getByRole("button", { name: "继续聊天" }).click();
  await expect(endDialog).toHaveCount(0);
  await expect(page.locator(".composer textarea")).toBeVisible();
  await page.getByRole("button", { name: "结束本次聊天" }).click();
  endDialog = page.getByRole("dialog", { name: "这次聊天对你有帮助吗？" });
  await endDialog.getByRole("button", { name: "有帮助" }).click();
  await endDialog.getByRole("button", { name: "说到一部分" }).click();
  await endDialog.getByRole("button", { name: "更清楚" }).click();
  await endDialog.getByRole("button", { name: "提交并结束" }).click();
  await expect(page.locator(".operation-notice")).toContainText("本次聊天已结束");
  await page.locator(".composer textarea").fill("我还想再补充一句");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByRole("button", { name: "结束本次聊天" }).click();
  await page.getByRole("dialog", { name: "这次聊天对你有帮助吗？" }).getByRole("button", { name: "跳过反馈并结束" }).click();
  await expect(page.locator(".operation-notice")).toContainText("本次聊天已结束");
});

test("点踩可直接结束并自愿补充失败原因", async ({ page }) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  await selectAndOpenTata(page);
  await page.locator(".composer textarea").fill("我不知道该说什么");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByRole("button", { name: "结束本次聊天" }).click();
  const dialog = page.getByRole("dialog", { name: "这次聊天对你有帮助吗？" });
  await dialog.getByRole("button", { name: "没帮到" }).click();
  await expect(dialog.getByRole("button", { name: "一直重复" })).toBeVisible();
  await dialog.getByRole("button", { name: "一直重复" }).click();
  let failedOnce = false;
  await page.route("**/api/conversations/*/end", async (route) => {
    if (!failedOnce) {
      failedOnce = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "TEMPORARY_FAILURE", message: "暂时提交失败" } }) });
      return;
    }
    await route.continue();
  });
  await dialog.getByRole("button", { name: "提交并结束" }).click();
  await expect(page.getByRole("alert")).toContainText("暂时提交失败");
  await expect(dialog.getByRole("button", { name: "没帮到" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("button", { name: "一直重复" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "提交并结束" }).click();
  await expect(page.locator(".operation-notice")).toContainText("本次聊天已结束");
  const exported = await page.evaluate(async () => {
    const sessionId = window.localStorage.getItem("otter-demo-session") ?? "";
    return fetch("/api/me/export", { headers: { "X-Otter-Demo-Session": sessionId } }).then((response) => response.json());
  });
  expect(exported.conversationFeedbackRecords).toEqual(expect.arrayContaining([
    expect.objectContaining({ feedbackSchemaVersion: 2, verdict: "not_helpful", reason: "repetitive" }),
  ]));
});

test("场景可切换星空、收起对话并恢复", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "仰望星空" }).click();
  await expect(page.getByRole("button", { name: "返回水面" })).toBeVisible();
  await page.getByRole("button", { name: "返回水面" }).click();
  await selectAndOpenTata(page);
  await page.getByRole("button", { name: "收起对话" }).click();
  await expect(page.getByRole("region", { name: /与\s*tata\s*的对话/u })).toHaveCount(0);
  await selectAndOpenTata(page);
  await expect(page.getByRole("region", { name: /与\s*tata\s*的对话/u })).toBeVisible();
});

test("声音需明确开启，新回复朗读一次，刷新不重播并支持分项控制", async ({ page }) => {
  await installAudioStubs(page);
  await page.goto("/");
  await selectAndOpenTata(page);
  await expect(page.getByRole("status").filter({ hasText: "tata" })).toBeVisible();
  await expect(page.getByRole("button", { name: "静音" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents ?? []).filter((event) => event.type === "speak").length)).toBe(1);
  const welcomeSpeech = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; text?: string }> }).__otterAudioEvents.find((event) => event.type === "speak"));
  expect(welcomeSpeech?.text).toContain("tata");

  await page.locator(".composer textarea").fill("今天有点累，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();
  await expect.poll(() => page.evaluate(() => ((window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents ?? []).filter((event) => event.type === "speak").length)).toBe(2);
  const spoken = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; rate?: number }> }).__otterAudioEvents.filter((event) => event.type === "speak").at(-1));
  expect(spoken?.rate).toBe(0.92);

  await page.getByRole("button", { name: /重播这条\s*tata\s*回复/u }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(3);

  await page.getByRole("button", { name: "打开设置" }).click();
  await page.getByRole("checkbox", { name: "场景背景音乐" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "场景背景音乐" })).not.toBeChecked();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await page.reload();
  const countAfterReload = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length);
  expect(countAfterReload).toBe(3);

  await selectAndOpenTata(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(4);
  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string }> }).__otterAudioEvents.filter((event) => event.type === "speak").length)).toBe(5);
  const safetySpeech = await page.evaluate(() => (window as unknown as { __otterAudioEvents: Array<{ type: string; rate?: number }> }).__otterAudioEvents.filter((event) => event.type === "speak").at(-1));
  expect(safetySpeech?.rate).toBe(0.96);
});

test("按住麦克风说话，松开后等待最终识别并自动发送", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = true;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {}
      stop() {
        queueMicrotask(() => {
          this.onresult?.({ results: [Object.assign([{ transcript: "我想用语音和 tata 说说话" }], { isFinal: true })] });
          this.onend?.();
        });
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
  });
  await page.goto("/");
  await selectAndOpenTata(page);
  const microphone = page.getByRole("button", { name: "按住麦克风说话" });
  const box = await microphone.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("button", { name: "松开发送语音" })).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".message-user").last()).toContainText("我想用语音和 tata 说说话");
});

test("浏览器不支持语音识别时给出可见反馈", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
  await page.goto("/");
  await selectAndOpenTata(page);
  await page.getByRole("button", { name: "按住麦克风说话" }).press("Space");
  await expect(page.locator(".operation-notice")).toContainText("当前浏览器不支持语音识别，请使用文字输入");
});

test("手机竖屏进入后强制切换横屏且不能绕过", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const prompt = page.getByRole("dialog", { name: "请把手机横过来" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("button", { name: "全屏并尝试横屏" })).toBeVisible();
  await expect(prompt.getByRole("button", { name: "暂时竖屏使用" })).toHaveCount(0);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("region", { name: "灵体水面世界" })).toBeVisible();
});

test("回访提供五个无催促结果并尊重用户选择", async ({ page }) => {
  let submitted: unknown = null;
  await page.route("**/api/session/bootstrap", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      researchId: "DEMO-LOCAL", researchContact: "现场研究人员",
      aiReminder: "你正在与 AI 系统互动。", conversation: { id: "conversation-1" }, messages: [], actions: [],
      followups: [{
        id: "followup-1", actionId: "action-1", dueAt: new Date().toISOString(), status: "pending",
        outcomeState: "not_started", outcomeLabeledAt: null,
        action: { id: "action-1", text: "写出汇报标题", status: "confirmed" },
      }],
      visit: { visitId: "visit-1", currentVisitAt: new Date().toISOString(), isReturning: true },
    }),
  }));
  await page.route("**/api/followups/followup-1/outcome", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "followup-1", outcomeState: "blocked", status: "closed" }) });
  });
  await page.goto("/");
  await openDeerDialogue(page);
  const card = page.locator(".followup-card");
  await expect(card).toContainText("不用交作业，只选最接近现在的状态");
  for (const label of ["还没开始", "推进了一点", "已经完成", "卡住了", "想改轻一点"]) {
    await expect(card.getByRole("button", { name: label })).toBeVisible();
  }
  await card.getByRole("button", { name: "卡住了" }).click();
  expect(submitted).toEqual({ state: "blocked", source: "ui_select" });
  await expect(card).toHaveCount(0);
  await expect(page.locator(".operation-notice")).toContainText("这不是失败");
});

test("用户可以查看、确认、纠正、停用和删除鹿禅的记忆", async ({ page }) => {
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
  const center = page.getByRole("dialog", { name: "鹿禅记得的我" });
  await expect(center).toContainText("鹿禅的推测");
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
