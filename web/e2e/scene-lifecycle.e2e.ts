import { expect, test } from "@playwright/test";

test("场景在 StrictMode 初始化和重新加载时不会重复销毁渲染器", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator(".scene-world-canvas")).toBeVisible();

  await page.reload();
  await expect(page.locator(".scene-world-canvas")).toBeVisible();

  expect(pageErrors.filter((message) => message.includes("_cancelResize"))).toEqual([]);
});
