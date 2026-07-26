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

test.describe("production and pilot command centre", () => {
  test("redirects visitors to login", async ({ page }) => {
    await page.goto("/admin/production");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fadmin%2Fproduction$/);
  });

  test("lets a Superadmin open the command centre and create a pilot", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Pilot mutation evidence runs once on desktop Chromium.",
    );
    await activateSuperadmin(page);
    await page.goto("/admin/production");
    await expect(
      page.getByRole("heading", { name: "Launch command centre" }),
    ).toBeVisible();

    const pilotName = `Automated founding cohort ${Date.now()}`;
    await page.getByLabel("Pilot name").fill(pilotName);
    await page.getByLabel("Target participants").fill("15");
    await page
      .getByLabel("Operating notes")
      .fill(
        "Controlled browser evidence for the production pilot command centre.",
      );
    await page.getByRole("button", { name: "Create pilot" }).click();

    await expect(page.getByText("Pilot cohort created.")).toBeVisible();
    await expect(page.getByRole("heading", { name: pilotName })).toBeVisible();
  });
});
