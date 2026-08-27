import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

test("用户理解边界后浏览外圈，并把公共内容带回船上", async ({ page }, testInfo) => {
  const communityWrites: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/community/") && request.method() !== "GET") communityWrites.push(`${request.method()} ${request.url()}`);
  });

  await page.goto("/");
  await page.evaluate(() => window.sessionStorage.removeItem("boonzoom-outer-boundary-v01"));
  await page.reload();

  await page.getByRole("button", { name: "去外圈看看" }).click();
  const boundary = page.getByRole("dialog", { name: "船上是你的内圈，门廊外是公共世界" });
  await expect(boundary).toContainText("浏览不等于报名、加入或留下兴趣");
  await boundary.getByRole("button", { name: "明白，去外圈看看" }).click();

  await expect(page.getByRole("region", { name: "外圈万象廊" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "万象廊" })).toBeVisible();
  const readOnlyBoundary = page.locator(".outer-gallery-footnote");
  await expect(readOnlyBoundary).toBeVisible();
  if (testInfo.project.name === "desktop-chrome") {
    await expect(readOnlyBoundary).toContainText("当前只读：不能报名、发帖或联系他人");
  } else {
    expect(await readOnlyBoundary.evaluate((element) => getComputedStyle(element, "::after").content)).toContain("当前只读");
  }
  await page.getByRole("button", { name: "查看：山城夜灯慢行" }).click();

  await expect(page.getByRole("heading", { name: "山城夜灯慢行" })).toBeVisible();
  await expect(page.getByText("不会报名，也不会自动保存成你的兴趣")).toBeVisible();
  await page.getByRole("button", { name: "带回船上，交给飞儿" }).click();

  await expect(page.getByRole("region", { name: "与飞儿的对话" })).toBeVisible();
  await expect(page.getByRole("article", { name: "从外圈带回的公共内容" })).toContainText("暂存给飞儿 · 未写入兴趣");
  expect(communityWrites).toEqual([]);
});

test("用户可以从外圈任意层级直接返回船上", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.sessionStorage.setItem("boonzoom-outer-boundary-v01", "acknowledged"));
  await page.getByRole("button", { name: "去外圈看看" }).click();
  await expect(page.getByRole("heading", { name: "万象廊" })).toBeVisible();
  await page.getByRole("button", { name: "返回船上" }).click();
  await expect(page.getByRole("button", { name: "去外圈看看" })).toBeVisible();
});
