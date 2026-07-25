import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

type PersonaResponse = {
  persona: string;
  userId: string;
  username: string;
  session: boolean;
  resources: {
    projectSlug: string;
    documentId: string;
    campaignSlug: string;
  } | null;
};

async function activatePersona(
  page: Page,
  persona: string,
  session = true,
  seedResources = false,
  reuseExisting = false,
) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: {
      session: session ? "true" : "false",
      seedResources: seedResources ? "true" : "false",
      reuseExisting: reuseExisting ? "true" : "false",
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<PersonaResponse>;
}

async function useExistingPersona(page: Page, persona: string) {
  return activatePersona(page, persona, true, false, true);
}

async function seedOwnershipScenario(page: Page) {
  await activatePersona(page, "project_owner", false);
  for (const persona of [
    "creator_selected",
    "creator_other",
    "investor_granted",
    "investor_expired",
    "moderator",
  ])
    await activatePersona(page, persona, false);
  const owner = await activatePersona(page, "project_owner", true, true, true);
  expect(owner.resources).not.toBeNull();
  return owner.resources!;
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
    expect((await page.goto("/app"))?.status()).toBe(200);
    expect((await page.goto("/projects/new"))?.status()).toBe(403);
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

  test("[scoped_admin:scoped_admin] membership and campaign administrators stay inside their scopes", async ({
    page,
  }) => {
    await activatePersona(page, "scoped_admin");
    expect((await page.goto("/admin/applications"))?.status()).toBe(200);
    expect((await page.goto("/admin/campaigns"))?.status()).toBe(403);

    await activatePersona(page, "campaign_admin");
    expect((await page.goto("/admin/campaigns"))?.status()).toBe(200);
    expect((await page.goto("/admin/applications"))?.status()).toBe(403);
  });

  test("[superadmin:superadmin] Superadmin can open the launch gate", async ({
    page,
  }) => {
    await activatePersona(page, "superadmin");
    expect((await page.goto("/admin/launch-gate"))?.status()).toBe(200);
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
    expect([403, 404]).toContain(
      (await page.goto("/profiles/launch-gate-private-target"))?.status(),
    );
  });

  test("[private_media:founder] unrelated member cannot download private R2-backed profile media", async ({
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
    expect([403, 404]).toContain(
      (await page.goto("/media/profile/launch-gate-private-target"))?.status(),
    );
  });

  test("[project_ownership:project_owner] project owner can edit while an unrelated Founder is denied", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    expect(
      (await page.goto(`/projects/${resources.projectSlug}/edit`))?.status(),
    ).toBe(200);

    await activatePersona(page, "founder");
    expect(
      (await page.goto(`/projects/${resources.projectSlug}/edit`))?.status(),
    ).toBe(404);
  });

  test("[diligence_grant:investor] active document access works and expired access is denied", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    const documentUrl = `/projects/${resources.projectSlug}/documents/${resources.documentId}`;

    await useExistingPersona(page, "investor_granted");
    const active = await page.request.get(documentUrl);
    expect(active.status()).toBe(200);
    expect(await active.text()).toContain(
      "private launch-gate diligence document",
    );

    await useExistingPersona(page, "investor_expired");
    expect((await page.request.get(documentUrl)).status()).toBe(404);

    await useExistingPersona(page, "creator_other");
    expect(
      (
        await page.goto(`/projects/${resources.projectSlug}/diligence`)
      )?.status(),
    ).toBe(403);
  });

  test("[campaign_ownership:creator] only an accepted Creator or moderator can open the campaign workspace", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    const workspaceUrl = `/campaigns/${resources.campaignSlug}/work`;

    await useExistingPersona(page, "creator_selected");
    expect((await page.goto(workspaceUrl))?.status()).toBe(200);

    await useExistingPersona(page, "creator_other");
    expect((await page.goto(workspaceUrl))?.status()).toBe(403);

    await useExistingPersona(page, "moderator");
    expect((await page.goto(workspaceUrl))?.status()).toBe(200);
  });

  test("[settlement_ownership:creator] settlement and dispute records stay limited to their Creator and moderators", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    const settlementUrl = `/campaigns/${resources.campaignSlug}/settlement`;

    await useExistingPersona(page, "creator_selected");
    expect((await page.goto(settlementUrl))?.status()).toBe(200);

    await useExistingPersona(page, "creator_other");
    expect((await page.goto(settlementUrl))?.status()).toBe(403);

    await useExistingPersona(page, "moderator");
    expect((await page.goto(settlementUrl))?.status()).toBe(200);
  });

  test("[moderator:moderator] assigned moderator can operate the campaign without inheriting Superadmin access", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    await useExistingPersona(page, "moderator");
    expect(
      (await page.goto(`/campaigns/${resources.campaignSlug}/work`))?.status(),
    ).toBe(200);
    expect(
      (
        await page.goto(`/campaigns/${resources.campaignSlug}/settlement`)
      )?.status(),
    ).toBe(200);
    expect((await page.goto("/admin/launch-gate"))?.status()).toBe(403);
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
