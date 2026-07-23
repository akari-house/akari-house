import { expect, test } from "@playwright/test";

test("desktop journey reaches the Hall, Common Table and Membership Desk", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to AKARI House" }),
  ).toBeVisible();
  const heroLayer = page.locator(".arrival-scene-base");
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
    page.getByRole("heading", { name: "How will you participate?" }),
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
  await expect(page.locator(".arrival-scene-sanctuary")).toHaveCSS(
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
    element.scrollLeft = element.clientWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.getByRole("button", { name: "Show AlphaBlockZ Ecosystem" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("account, multi-role profile and server privacy journey", async ({
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
  const profilePath = `/profiles/${username}`;

  await page.goto("/register");
  await page.getByLabel("Display name").fill("Journey Member");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel(/Founder/).check();
  await page.getByLabel(/Creator/).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/app\?welcome=1$/);
  await expect(page.getByText("Your profile starts private")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Founder Build projects/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /Creator Share expertise/ }),
  ).toBeChecked();

  await page
    .getByLabel("Professional headline")
    .fill("Founder connecting thoughtful communities");
  await page.getByLabel("Location").fill("Berlin, Germany");
  await page
    .getByLabel("Biography")
    .fill("Building durable relationships between founders and creators.");
  await page
    .getByRole("textbox", { name: "Expertise", exact: true })
    .fill("Community strategy and partnerships");
  await page.getByLabel("Open to").fill("Collaborations and introductions");
  await page.getByLabel("Website").fill("https://akari.club");
  await page.getByLabel("Public").check();
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page).toHaveURL(/\/app\?saved=1$/);
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(profilePath);
  await expect(
    page.getByRole("heading", { name: "Journey Member" }),
  ).toBeVisible();
  await expect(
    page.getByText("Community strategy and partnerships"),
  ).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByLabel("Private").check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/app\?saved=1$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(profilePath);
  await expect(
    page.getByRole("heading", { name: "This room is private." }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Community strategy");
});
