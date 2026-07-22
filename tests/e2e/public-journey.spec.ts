import { expect, test } from "@playwright/test";

test("desktop journey reaches the Hall, Common Table and Membership Desk", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to AKARI House" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Enter the House/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your paths. One House." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Enter Strategy Room/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Strategy Room" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Close Strategy Room and return to the Hall",
    })
    .click();
  await page.getByRole("tab", { name: "Investor Workspace" }).click();
  await expect(page.getByText("Kitsune Labs")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How will you participate?" }),
  ).toBeVisible();
});

test("mobile navigation traps focus and has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

test("reduced motion disables environmental animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".arrival-media")).toHaveCSS(
    "animation-name",
    "none",
  );
});
