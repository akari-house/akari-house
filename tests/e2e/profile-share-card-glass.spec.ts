import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activateFounder(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  const response = await page.request.post("/__test__/personas/founder", {
    headers: fixtureHeaders,
    form: {
      session: "true",
      reuseExisting: "true",
    },
  });
  expect(response.status()).toBe(201);
}

test.describe("AKARI glass profile sharing card", () => {
  test.beforeEach(async ({ page }) => {
    await activateFounder(page);
  });

  test("keeps the approved credit-card composition and theme choices", async ({
    page,
  }, testInfo) => {
    await page.goto("/profile-card", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Profile sharing card" }),
    ).toBeVisible();
    await expect(page.getByText("Midnight Glass", { exact: true })).toBeVisible();
    await expect(page.getByText("Sakura Glass", { exact: true })).toBeVisible();
    await expect(page.getByText("Pearl Glass", { exact: true })).toBeVisible();

    const landscape = page.locator('input[name="orientation"][value="landscape"]');
    await landscape.check();
    const midnight = page.locator('input[name="palette"][value="midnight"]');
    await midnight.check();

    const card = page.locator(".akari-glass-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/theme-midnight/);
    await expect(page.locator(".glass-card-brand-lockup img")).toBeVisible();
    await expect(page.locator(".glass-card-avatar")).toBeVisible();
    await expect(page.locator(".glass-card-profile-plate")).toBeVisible();

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const ratio = (box?.width ?? 1) / (box?.height ?? 1);
    expect(ratio).toBeGreaterThan(1.54);
    expect(ratio).toBeLessThan(1.63);

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);

    await page.locator('input[name="palette"][value="sakura"]').check();
    await expect(card).toHaveClass(/theme-sakura/);
    await page.locator('input[name="palette"][value="lantern"]').check();
    await expect(card).toHaveClass(/theme-lantern/);

    if (
      process.env.AKARI_CAPTURE_LAUNCH_EVIDENCE === "1" &&
      ["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name)
    ) {
      const directory = `launch-gate-artifacts/visual-evidence/${testInfo.project.name}`;
      mkdirSync(directory, { recursive: true });
      await page.locator('input[name="palette"][value="midnight"]').check();
      await page.screenshot({
        path: `${directory}/workspace-profile-sharing-glass-card.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  });
});
