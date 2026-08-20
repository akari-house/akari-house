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

function localInput(date: Date) {
  return date.toISOString().slice(0, 16);
}

test.describe("R83 profile sharing and event publishing", () => {
  test("renders an optimized AKARI sharing-card workspace with visible credibility and clean socials", async ({
    page,
  }, testInfo) => {
    await activateSuperadmin(page);
    await page.goto("/profile-card", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Profile sharing card" }),
    ).toBeVisible({ timeout: 10_000 });
    const card = page.locator(".glass-profile-card");
    const stage = page.locator(".glass-card-stage");
    const controls = page.locator(".glass-card-controls");
    const metrics = card.locator(".glass-card-metrics");
    const connect = card.locator(".glass-connect-strip");
    await expect(card).toBeVisible();
    await expect(controls).toBeVisible();
    await expect(card.locator('img[alt="AKARI"]')).toBeVisible();

    // The launch-gate Superadmin fixture is members-only, so the sharing card
    // must not expose a public QR until that profile is explicitly published.
    await expect(card.locator(".glass-profile-qr")).toHaveCount(0);
    await expect(
      card.locator('[aria-label="Private AKARI profile"]'),
    ).toBeVisible();
    await expect(
      card.getByText("Publish to enable QR", { exact: true }),
    ).toBeVisible();

    // R93 keeps credibility on the actual share object instead of hiding the
    // already-computed member signals below the preview.
    await expect(metrics).toBeVisible();
    await expect(
      metrics.getByText("Opportunities", { exact: true }),
    ).toBeVisible();
    await expect(metrics.getByText("Reach", { exact: true })).toBeVisible();
    await expect(
      metrics.getByText("AKARI signal", { exact: true }),
    ).toBeVisible();

    // The final card uses one role treatment, removes the tiny brand tagline,
    // and keeps verification as the explicit trust marker.
    await expect(card.locator(".glass-role-pills")).toBeHidden();
    await expect(card.locator(".glass-card-verification")).toBeVisible();
    const brandTaglineDisplay = await card
      .locator(".glass-card-brand")
      .evaluate((element) => getComputedStyle(element, "::after").display);
    expect(brandTaglineDisplay).toBe("none");

    // The old decorative divider crossed the social icons. It is intentionally
    // removed and the metrics/social bands must occupy separate vertical space.
    const dividerDisplay = await connect.evaluate(
      (element) => getComputedStyle(element, "::after").display,
    );
    expect(dividerDisplay).toBe("none");
    await expect(connect.getByText("Connect", { exact: true })).toBeHidden();
    const metricsBox = await metrics.boundingBox();
    const connectBox = await connect.boundingBox();
    expect(metricsBox).not.toBeNull();
    expect(connectBox).not.toBeNull();
    if (metricsBox && connectBox) {
      expect(metricsBox.y + metricsBox.height).toBeLessThanOrEqual(
        connectBox.y + 2,
      );
    }

    await expect(
      page.getByText("Midnight Glass", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Pearl Glass", { exact: true })).toBeVisible();
    await expect(page.getByText("Sakura Glass", { exact: true })).toBeVisible();
    await expect(page.getByText("Blossom Plum", { exact: true })).toBeVisible();
    await expect(page.getByText("Lantern Gold", { exact: true })).toBeVisible();

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const ratio = box.width / box.height;
      expect(ratio).toBeGreaterThan(1.55);
      expect(ratio).toBeLessThan(1.63);
      expect(box.width).toBeLessThanOrEqual(590);
    }

    if (testInfo.project.name === "desktop-chromium") {
      const stageBox = await stage.boundingBox();
      const controlsBox = await controls.boundingBox();
      expect(stageBox).not.toBeNull();
      expect(controlsBox).not.toBeNull();
      if (stageBox && controlsBox) {
        expect(controlsBox.x).toBeGreaterThan(stageBox.x + stageBox.width - 4);
        expect(Math.abs(controlsBox.y - stageBox.y)).toBeLessThanOrEqual(8);
      }

      const languageToggle = page.getByText("Show spoken languages", {
        exact: true,
      });
      const toggleBox = await languageToggle.boundingBox();
      expect(toggleBox).not.toBeNull();
      if (toggleBox) expect(toggleBox.height).toBeLessThanOrEqual(48);

      const screenshot = await page.locator(".share-card-layout").screenshot();
      await testInfo.attach("r93-profile-card-credibility-and-socials", {
        body: screenshot,
        contentType: "image/png",
      });
    }

    await page
      .locator('label.glass-palette-choice:has(input[value="pearl"])')
      .click({ force: true });
    await expect(card).toHaveClass(/palette-pearl/);

    const viewportWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("shows Superadmin direct event publishing and publishes a valid event", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Event mutation evidence runs once on desktop Chromium.",
    );
    await activateSuperadmin(page);
    await page.goto("/events/new");

    await expect(
      page.getByRole("button", { name: "Publish event" }),
    ).toBeVisible();
    await expect(
      page.getByText("Publish now is enabled", { exact: false }),
    ).toBeVisible();

    const title = `R79 Launch Event ${Date.now()}`;
    const startsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    startsAt.setUTCMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

    await page.getByLabel("Event title").fill(title);
    await page
      .getByLabel("Summary")
      .fill("A controlled AKARI browser test for direct event publishing.");
    await page
      .getByLabel("Starts in the event timezone")
      .fill(localInput(startsAt));
    await page
      .getByLabel("Ends in the event timezone")
      .fill(localInput(endsAt));
    await page.getByRole("combobox", { name: /Event timezone/ }).fill("UTC");
    await page
      .getByLabel("HTTPS meeting URL")
      .fill("https://meet.example.com/akari-r79");

    await page.getByRole("button", { name: "Publish event" }).click();
    await expect(page).toHaveURL(/\/events\/r79-launch-event-/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });
});
