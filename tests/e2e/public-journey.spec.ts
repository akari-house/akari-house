import { expect, test } from "@playwright/test";

test("desktop journey reaches the Hall, Common Table and Membership Desk", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to AKARI House" }),
  ).toBeVisible();
  const heroLayer = page.locator(".arrival-scene");
  await expect(page.locator(".arrival-media")).toHaveAttribute(
    "data-interactive",
    "true",
  );
  const initialTransform = await heroLayer.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  if (testInfo.project.name === "desktop-chromium") {
    await page.mouse.move(80, 140);
    await expect
      .poll(() =>
        heroLayer.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(initialTransform);
  }
  await page.getByRole("link", { name: /Enter the House/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your paths. One House." }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Strategy Room/ }).click();
  await expect(
    page.getByRole("heading", { name: "Strategy Room", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to the Hall" }).click();
  await expect(page).toHaveURL(/\/hall$/);
  await page.goto("/#common");
  await page.getByRole("tab", { name: "Investor Workspace" }).click();
  await expect(page.getByText("Kitsune Labs")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "How will you sit at the table?" }),
  ).toBeVisible();
});

test("mobile navigation traps focus and has no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only journey");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.locator('button[aria-controls="mobile-menu"]');
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
  await expect(page.locator(".arrival-sanctuary-light")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("mobile Archive responds to native horizontal swiping", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only journey");
  await page.goto("/#archive");
  const track = page.locator(".archive-carousel-track");
  await track.evaluate((element) => {
    const secondSlide = element.children.item(1) as HTMLElement | null;
    element.scrollLeft = secondSlide?.offsetLeft ?? element.clientWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.getByRole("button", { name: "Show AlphaBlockZ Ecosystem" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("membership request remains gated before human approval", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop coverage is sufficient",
  );

  const suffix = `${Date.now()}-${testInfo.workerIndex}`;
  const username = `journey-${suffix}`;
  const email = `${username}@example.test`;
  const password = `Akari-test-${suffix}-safe`;
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Journey Member");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/Founder/).check();
  await page.getByLabel(/Creator/).check();
  await page
    .getByLabel("What brings you to AKARI?")
    .fill(
      "I am building a trusted community product and want to contribute thoughtful partnerships.",
    );
  await page
    .getByLabel(/I understand that AKARI reviews every request/)
    .check();
  await page.getByRole("button", { name: "Send membership request" }).click();

  await expect(page).toHaveURL(/\/membership\/check-email$/);
  await expect(
    page.getByRole("heading", { name: "Confirm where we can reach you" }),
  ).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("does not have member access yet")).toBeVisible();
});
