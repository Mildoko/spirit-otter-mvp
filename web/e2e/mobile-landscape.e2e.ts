import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.E2E_MODE !== "demo", "仅在 E2E_MODE=demo 时运行");

const landscapeSizes = [
  { width: 667, height: 375, label: "compact" },
  { width: 844, height: 390, label: "standard" },
  { width: 932, height: 430, label: "wide-standard" },
] as const;

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document, `页面宽度 ${dimensions.document}px 不应超过视口 ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const size of landscapeSizes) {
  test(`${size.label} ${size.width}x${size.height} 保持内圈可操作`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");

    await expect(page.getByRole("dialog", { name: "请把手机横过来" })).toHaveCount(0);
    await expect(page.locator(".scene-world-canvas")).toBeVisible();
    await expectNoPageOverflow(page);

    const agentButtons = page.locator(".agent-squad-member");
    await expect(agentButtons).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const box = await agentButtons.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }

    await page.getByRole("button", { name: /与tata对话，温馨陪伴/ }).click();
    await expect(page.getByRole("region", { name: "与tata的对话" })).toBeVisible();
    await expect(page.locator(".composer textarea")).toBeVisible();
    const fontSize = await page.locator(".composer textarea").evaluate((element) => getComputedStyle(element).fontSize);
    expect(Number.parseFloat(fontSize)).toBeGreaterThanOrEqual(20);
    await expectNoPageOverflow(page);
  });
}

test("标准横屏使用单窗胶片、共享船队，并允许从外圈选择 Agent 返回内圈", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.evaluate(() => window.sessionStorage.setItem("boonzoom-outer-boundary-v01", "acknowledged"));
  await page.reload();

  await page.getByRole("button", { name: "去外圈看看" }).click();
  await expect(page.getByRole("region", { name: "外圈万象廊" })).toBeVisible();
  await expect(page.locator(".outer-circle-background-mobile")).toBeVisible();
  await expect(page.locator(".outer-film-corridor")).toBeVisible();
  await expect(page.locator(".spirit-boat-stage-outer")).toBeVisible();

  const film = await page.locator(".outer-portal-grid").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(film.scrollWidth).toBeGreaterThan(film.clientWidth);
  const firstCard = await page.locator(".outer-portal-card").first().boundingBox();
  expect(firstCard?.width).toBeGreaterThan(220);
  await expectNoPageOverflow(page);

  await page.getByRole("button", { name: /与tata对话，温馨陪伴/ }).click();
  await expect(page.getByRole("region", { name: "与tata的对话" })).toBeVisible();
  await expect(page.getByRole("region", { name: "外圈万象廊" })).toHaveCount(0);
});
