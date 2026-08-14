import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

test("演示模式完成深汐、自动混合、拾岸、行动和安全退场", async ({ page }) => {
  await page.request.delete("/api/me/data");
  await page.goto("/");
  await expect(page.getByText("本地演示，不保存数据")).toBeVisible();
  await expect(page.getByRole("img", { name: /灵体水獭/ })).toBeVisible();

  await page.locator(".composer textarea").fill("事情都堆在一起，我不知道先做哪个，想先说说。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant").last()).toBeVisible();

  await page.locator(".composer textarea").fill("请帮我整理手上的任务。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText(/角色路由：shore_pick/)).toBeVisible();
  await expect(page.getByText("帮我整理", { exact: true })).toHaveCount(0);
  await page.locator(".composer textarea").fill("先写明天汇报的标题。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("捞起的一件事")).toBeVisible();
  await page.getByRole("button", { name: "确认这一小步" }).click();
  await expect(page.getByText("行动已确认")).toBeVisible();

  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect(page.locator(".character-panel img")).toHaveCount(0);
  await expect(page.locator(".emotion-diagnostics")).toHaveCount(0);
});
