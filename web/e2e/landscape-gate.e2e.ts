import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

test("竖屏覆盖欢迎页和完整体验，且不能绕过", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const gate = page.getByRole("dialog", { name: "请把手机横过来" });
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("只提供横屏版本");
  await expect(page.getByRole("button", { name: "暂时竖屏使用" })).toHaveCount(0);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(gate).toBeHidden();
});
