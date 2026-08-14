import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_INVITE_CODE, "需要一次性 E2E_INVITE_CODE 和正在运行的完整服务");

test("首次进入、同意整理、确认一个行动并进入安全状态", async ({ page }) => {
  const inviteCode = process.env.E2E_INVITE_CODE;
  await page.goto("/");
  await page.getByLabel("一次性邀请码").fill(inviteCode!);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "进入静水区" }).click();
  await expect(page.getByText("陪伴模式")).toBeVisible();
  const reminderClose = page.getByRole("button", { name: "关闭提醒" });
  if (await reminderClose.isVisible()) await reminderClose.click();

  await page.getByRole("button", { name: "帮我整理" }).click();
  await page.locator(".composer textarea").fill("手上的事情太多，我想先理出一个入口。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.getByRole("button", { name: "愿意，只整理一件" }).click();

  await page.locator(".composer textarea").fill("先把明天汇报的标题写出来。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("捞起的一件事")).toBeVisible();
  await page.getByRole("button", { name: "确认这一小步" }).click();

  await page.locator(".composer textarea").fill("我马上要从楼顶跳下去。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("button", { name: "请现场研究人员过来" })).toBeVisible();
  await expect(page.locator(".character-panel img")).toHaveCount(0);
});
