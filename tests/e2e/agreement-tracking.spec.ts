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

test.describe("R80 CRM agreement boundary", () => {
  test("retires House agreement operations and directs Superadmin to CRM by AKARI", async ({
    page,
  }) => {
    await activatePersona(page, "superadmin");

    const legacyResponse = await page.goto("/admin/agreements");
    expect(legacyResponse?.status()).toBe(404);

    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Admin workspace" }),
    ).toBeVisible();
    await expect(page.getByText("One CRM source of truth.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open CRM by AKARI" }),
    ).toHaveAttribute("href", "https://crm.akarihouse.com");
    await expect(
      page.getByRole("link", { name: "Agreement tracking" }),
    ).toHaveCount(0);
  });

  test("does not expose the retired House agreement endpoint to Founders", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    const response = await page.goto("/admin/agreements");
    expect(response?.status()).toBe(404);
  });
});
