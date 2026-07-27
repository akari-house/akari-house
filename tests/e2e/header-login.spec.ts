import { expect, test } from "@playwright/test";

test("desktop login action stays visible and opens the real sign-in form", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop header regression coverage",
  );

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");

  const login = page.getByRole("link", { name: "Log in", exact: true });
  await expect(login).toBeVisible();

  const box = await login.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1366);

  await login.click();
  await expect(page).toHaveURL(/\/signin(?:\?.*)?$/);
  await expect(
    page.getByRole("heading", { name: "Return to the House" }),
  ).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveCount(1);
  await expect(page.locator('input[name="password"]')).toHaveCount(1);
});

test("direct login URL redirects at the edge and preserves returnTo", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop login fallback coverage",
  );

  const response = await page.goto("/login?returnTo=%2Fdeals");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/signin\?returnTo=%2Fdeals$/);
  await expect(
    page.getByRole("heading", { name: "Return to the House" }),
  ).toBeVisible();
});
