import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activateSuperadmin(page: Page) {
  await page.context().clearCookies();
  const response = await page.request.post("/__test__/personas/superadmin", {
    headers: fixtureHeaders,
    form: { session: "true", reuseExisting: "true" },
  });
  expect(response.status()).toBe(201);
}

test("My House keeps the full profile editor out of the way until requested", async ({
  page,
}) => {
  await activateSuperadmin(page);
  await page.goto("/app", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "Continue from the role you need now." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Edit profile & privacy/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeHidden();

  await page.getByRole("link", { name: /Edit profile & privacy/ }).click();
  await expect(page).toHaveURL(/\/app#profile-editor$/);
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.locator(".profile-photo-editor")).toBeVisible();
});

test("public House chapters never render as hidden dead-scroll content", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  for (const selector of [
    "#hall .section-intro",
    "#common .section-intro",
    "#journey > div:first-child",
    "#archive .archive-copy",
  ]) {
    const chapter = page.locator(selector);
    await expect(chapter).toHaveCSS("opacity", "1");
    const transform = await chapter.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    expect(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(
      true,
    );
  }

  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
