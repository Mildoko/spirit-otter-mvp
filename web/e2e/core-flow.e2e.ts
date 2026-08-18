import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_INVITE_CODE, "需要一次性 E2E_INVITE_CODE 和正在运行的完整服务");

test("首次进入、自动整理、刷新恢复、邀请码不可复用、安全退场和永久删除", async ({ page, browser }) => {
  const inviteCode = process.env.E2E_INVITE_CODE;
  await page.goto("/");
  await page.getByLabel("一次性邀请码").fill(inviteCode!);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "进入静水区" }).click();
  await expect(page.getByText("浮屿", { exact: true })).toBeVisible();
  const reminderClose = page.getByRole("button", { name: "关闭提醒" });
  if (await reminderClose.isVisible()) await reminderClose.click();

  await page.locator(".composer textarea").fill("手上的事情太多，我想先理出一个入口。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("愿意，只整理一件", { exact: true })).toHaveCount(0);

  await page.locator(".composer textarea").fill("先写明天汇报的标题。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("捞起的一件事")).toBeVisible();
  await page.getByRole("button", { name: "确认这一小步" }).click();
  await expect(page.getByText("行动已确认", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "已完成" })).toBeVisible();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/");
  await secondPage.getByLabel("一次性邀请码").fill(inviteCode!);
  for (const checkbox of await secondPage.getByRole("checkbox").all()) await checkbox.check();
  await secondPage.getByRole("button", { name: "进入静水区" }).click();
  await expect(secondPage.getByRole("alert")).toContainText("邀请码无效、已使用或已过期");
  await secondContext.close();

  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect(page.locator(".character-panel img")).toHaveCount(0);

  await page.getByRole("button", { name: "打开设置" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "永久删除本地数据" }).click();
  await expect(page.getByLabel("一次性邀请码")).toBeVisible();
});
