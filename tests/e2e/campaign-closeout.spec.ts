import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activatePersona(page: Page, persona: string) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: {
      session: "true",
      seedResources: "false",
      reuseExisting: "true",
    },
  });
  expect(response.status()).toBe(201);
}

async function seedCloseout(page: Page) {
  const response = await page.request.post("/__test__/campaign-closeout/seed", {
    headers: fixtureHeaders,
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { campaignSlug: string };
  return body.campaignSlug;
}

test.describe("R82 campaign closeout", () => {
  test("settles, reports and closes a campaign without CRM renewal", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Stateful closeout evidence runs once against the shared test database.",
    );

    await activatePersona(page, "founder");
    await activatePersona(page, "creator_selected");
    await activatePersona(page, "superadmin");
    const slug = await seedCloseout(page);

    await page.goto(`/campaigns/${slug}/closeout`, {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: "R69 Closeout Campaign" }),
    ).toBeVisible();
    await expect(
      page.getByText("Approved compensation", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("$500.00", { exact: true }).first(),
    ).toBeVisible();

    await page.getByLabel("Payment status").selectOption("paid");
    await page.getByLabel("Payment method").fill("External bank transfer");
    await page.getByLabel("Transaction reference").fill("R82-E2E-TX-001");
    await page.getByRole("button", { name: "Save settlement" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("1/1", { exact: true })).toBeVisible();
    await expect(
      page.getByText("$0.00", { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Finalize report" }).click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", {
        name: "Final report is locked to closeout evidence.",
      }),
    ).toBeVisible();

    await page.getByLabel("Recipient").fill("R82 Test Client");
    await page.getByRole("button", { name: "Mark report delivered" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Sent to R82 Test Client/)).toBeVisible();

    await page.getByLabel("Acknowledgement").selectOption("acknowledged");
    await page
      .getByLabel("Note", { exact: true })
      .fill("Client confirmed campaign completion.");
    await page.getByRole("button", { name: "Record acknowledgement" }).click();
    await page.waitForLoadState("networkidle");

    await page
      .getByLabel("Closeout note")
      .fill("All campaign obligations completed and reconciled.");
    await page.getByRole("button", { name: "Close campaign" }).click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("closed", { exact: true }).first(),
    ).toBeVisible();

    await expect(page.getByLabel("Next step")).toHaveCount(0);
    await expect(page.getByLabel("Stage")).toHaveCount(0);
    await expect(page.getByLabel("Renewal note")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save renewal outcome" }),
    ).toHaveCount(0);
  });

  test("rejects a Creator from the private operator closeout", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Stateful closeout permission evidence runs once against the shared test database.",
    );

    await activatePersona(page, "founder");
    await activatePersona(page, "creator_selected");
    await activatePersona(page, "superadmin");
    const slug = await seedCloseout(page);
    await activatePersona(page, "creator_selected");

    const response = await page.goto(`/campaigns/${slug}/closeout`);
    expect(response?.status()).toBe(403);
  });
});
