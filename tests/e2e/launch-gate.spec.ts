import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activatePersona(page: Page, persona: string, session = true) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: { session: session ? "true" : "false" },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{
    persona: string;
    userId: string;
    username: string;
    session: boolean;
  }>;
}

test.describe("automated launch gate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Role permission matrix runs once on desktop Chromium.",
    );
    await page.context().clearCookies();
  });

  test("[visitor:visitor] GET /app redirects to login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
  });

  test("[applicant:applicant] applicant reaches status dashboard but not Founder tools", async ({
    page,
  }) => {
    await activatePersona(page, "applicant");
    const dashboard = await page.goto("/app");
    expect(dashboard?.status()).toBe(200);
    const founderTool = await page.goto("/projects/new");
    expect(founderTool?.status()).toBe(403);
  });

  test("[founder:founder] Founder can open project creation without admin access", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    expect((await page.goto("/projects/new"))?.status()).toBe(200);
    expect((await page.goto("/admin/launch-gate"))?.status()).toBe(403);
  });

  test("[creator:creator] Creator cannot open Founder project creation", async ({
    page,
  }) => {
    await activatePersona(page, "creator");
    expect((await page.goto("/projects/new"))?.status()).toBe(403);
    expect((await page.goto("/app"))?.status()).toBe(200);
  });

  test("[investor:investor] Investor cannot open Founder project creation", async ({
    page,
  }) => {
    await activatePersona(page, "investor");
    expect((await page.goto("/projects/new"))?.status()).toBe(403);
    expect((await page.goto("/app"))?.status()).toBe(200);
  });

  test("[multi_role:multi_role] multi-role access is a role union without admin inheritance", async ({
    page,
  }) => {
    await activatePersona(page, "multi_role");
    expect((await page.goto("/projects/new"))?.status()).toBe(200);
    expect((await page.goto("/admin/launch-gate"))?.status()).toBe(403);
  });

  test("[scoped_admin:scoped_admin] membership admin cannot enter campaign administration", async ({
    page,
  }) => {
    await activatePersona(page, "scoped_admin");
    expect((await page.goto("/admin/applications"))?.status()).toBe(200);
    expect((await page.goto("/admin/campaigns"))?.status()).toBe(403);
  });

  test("[superadmin:superadmin] Superadmin can open the launch gate", async ({
    page,
  }) => {
    await activatePersona(page, "superadmin");
    const response = await page.goto("/admin/launch-gate");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Real-role permission testing" }),
    ).toBeVisible();
  });

  test("[suspended:suspended] suspended session cannot enter protected routes", async ({
    page,
  }) => {
    await activatePersona(page, "suspended");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
  });

  test("[blocked:blocked] invalidated blocked session cannot enter protected routes", async ({
    page,
  }) => {
    await activatePersona(page, "blocked");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
  });

  test("[cross_account:founder] unrelated member cannot read a private profile", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    const target = await page.request.post(
      "/__test__/personas/private_target",
      {
        headers: fixtureHeaders,
        form: { session: "false" },
      },
    );
    expect(target.status()).toBe(201);
    const profile = await page.goto("/profiles/launch-gate-private-target");
    expect([403, 404]).toContain(profile?.status());
  });

  test("[session:founder] logout destroys the server session", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    expect((await page.goto("/app"))?.status()).toBe(200);
    const logout = await page.request.post("/logout", {
      headers: { Origin: "http://127.0.0.1:5173" },
      maxRedirects: 0,
    });
    expect(logout.status()).toBe(302);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
  });

  test("[request_security:founder] cross-origin state change is rejected without ending the session", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    const rejected = await page.request.post("/logout", {
      headers: { Origin: "https://attacker.example" },
      maxRedirects: 0,
    });
    expect(rejected.status()).toBe(403);
    expect((await page.goto("/app"))?.status()).toBe(200);
  });
});

test("[accessibility:visitor] mobile navigation has no serious accessibility failures or horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Accessibility launch evidence runs once on mobile Chromium.",
  );
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
