import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

test("鹿禅、tata 和飞儿都可被用户点击并保持各自对话归属", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /与tata对话，温馨陪伴/ }).click();
  await expect(page.getByRole("region", { name: "与tata的对话" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "tata向你打了招呼" })).toBeVisible();
  await page.locator(".composer textarea").fill("今天真的很累");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant:not(.thinking)").last()).toContainText("消耗");
  await expect(page.locator(".message-assistant:not(.thinking)").last().locator("span").first()).toHaveText("tata");

  await page.getByRole("button", { name: /与飞儿对话，生活秘书/ }).click();
  await expect(page.getByRole("region", { name: "与飞儿的对话" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "飞儿向你打了招呼" })).toBeVisible();
  await page.locator(".composer textarea").fill("我喜欢城市摄影");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".message-assistant:not(.thinking)").last()).toContainText("不会直接");
  await expect(page.locator(".message-assistant:not(.thinking)").last().locator("span").first()).toHaveText("飞儿");

  await page.getByRole("button", { name: /与鹿禅对话，禅意观照/ }).click();
  await expect(page.getByRole("region", { name: "与鹿禅的对话" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "鹿禅向你打了招呼" })).toBeVisible();
  await expect(page.locator(".message-assistant:not(.thinking)").nth(0).locator("span").first()).toHaveText("tata");
  await expect(page.locator(".message-assistant:not(.thinking)").nth(1).locator("span").first()).toHaveText("飞儿");
});
