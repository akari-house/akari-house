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

test.describe("R82 CRM boundary", () => {
  test("keeps retired CRM operations and CRM promotion out of AKARI House", async ({
    page,
  }) => {
    await activatePersona(page, "superadmin");

    for (const legacyRoute of [
      "/admin/agreements",
      "/admin/relationships",
      "/admin/operating-rhythm",
      "/admin/finance",
      "/admin/workspaces",
    ]) {
      const legacyResponse = await page.goto(legacyRoute);
      expect(legacyResponse?.status(), legacyRoute).toBe(404);
    }

    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Admin workspace" }),
    ).toBeVisible();

    await expect(page.getByText("One CRM source of truth.")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Open CRM by AKARI" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Agreement tracking" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Relationship intelligence/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Operating rhythm/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /Finance/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /SaaS workspace/i }),
    ).toHaveCount(0);
  });

  test(
    "does not expose retired CRM endpoints to Founders",
    async ({ page }) => {
      await activatePersona(page, "founder");
      for (const legacyRoute of [
        "/admin/agreements",
        "/admin/relationships",
        "/admin/operating-rhythm",
        "/admin/finance",
        "/admin/workspaces",
      ]) {
        const response = await page.goto(legacyRoute);
        expect(response?.status(), legacyRoute).toBe(404);
      }
    },
  );
});
