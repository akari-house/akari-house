import { expect, test } from "@playwright/test";

test("desktop login action stays inside the viewport and opens login", async ({
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
  await expect(page).toHaveURL(/\/login$/);
});
