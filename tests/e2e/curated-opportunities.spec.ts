import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };
const projectSlug = "launch-gate-owned-project";
const confidentialMarker = "CONFIDENTIAL-AKARI-ROOM-EVIDENCE";

type Scenario = {
  projectSlug: string;
  projectId: string;
  documentId: string;
  confidentialMarker: string;
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
  return response.json() as Promise<{
    persona: string;
    userId: string;
    username: string;
    session: boolean;
  }>;
}

async function seedOpportunity(page: Page): Promise<Scenario> {
  const response = await page.request.post("/__test__/opportunities/seed", {
    headers: fixtureHeaders,
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Scenario>;
}

async function prepareScenario(page: Page): Promise<Scenario> {
  await activatePersona(page, "project_owner", false);
  for (const persona of [
    "creator",
    "creator_selected",
    "creator_other",
    "investor",
    "investor_granted",
    "investor_expired",
    "moderator",
    "suspended",
    "private_target",
    "founder",
    "scoped_admin",
    "superadmin",
  ])
    await activatePersona(page, persona, false);
  await activatePersona(page, "project_owner", false, true, true);
  const scenario = await seedOpportunity(page);
  await page.context().clearCookies();
  return scenario;
}

async function usePersona(page: Page, persona: string) {
  return activatePersona(page, persona, true, false, true);
}

test.describe("curated opportunity permissions", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Permission mutation evidence runs once on desktop Chromium.",
    );
    await prepareScenario(page);
  });

  test("visitors receive approved previews but no confidential room data", async ({
    page,
  }) => {
    await page.goto("/deals");
    await expect(
      page.getByRole("heading", {
        name: "Considered opportunities, opened with context.",
      }),
    ).toBeVisible();
    await expect(page.getByText("A permission-safe public opportunity preview."))
      .toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText("PUBLIC-AKARI-OPPORTUNITY-EVIDENCE"))
      .toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Authorised diligence space" }),
    ).toHaveCount(0);
  });

  test("Creator and claimed Investor roles do not unlock capital information", async ({
    page,
  }) => {
    await usePersona(page, "creator");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText("restricted", { exact: true })).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await usePersona(page, "investor");
    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByText("verification required", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);
  });

  test("approved Investor receives only the authorised private room", async ({
    page,
  }) => {
    const scenario = await seedOpportunity(page);
    await usePersona(page, "investor_granted");
    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByRole("heading", { name: "Authorised diligence space" }),
    ).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Launch Gate Diligence.txt" }),
    ).toBeVisible();

    const documentResponse = await page.request.get(
      `/projects/${projectSlug}/documents/${scenario.documentId}`,
    );
    expect(documentResponse.status()).toBe(200);
  });

  test("expired and revoked access remove private content immediately", async ({
    page,
  }) => {
    const scenario = await seedOpportunity(page);
    await usePersona(page, "investor_expired");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText("expired", { exact: true })).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await usePersona(page, "investor_granted");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText(confidentialMarker)).toBeVisible();

    const revoke = await page.request.post("/__test__/opportunities/revoke", {
      headers: fixtureHeaders,
    });
    expect(revoke.status()).toBe(200);
    await page.reload();
    await expect(page.getByText("revoked", { exact: true })).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/projects/${projectSlug}/documents/${scenario.documentId}`,
        )
      ).status(),
    ).toBe(404);

    const state = await page.request.post("/__test__/opportunities/state", {
      headers: fixtureHeaders,
    });
    expect(state.status()).toBe(200);
    await expect(state.json()).resolves.toMatchObject({
      accessStatus: "revoked",
      revokeAudits: 1,
    });
  });

  test("Founder ownership and scoped administration remain deny by default", async ({
    page,
  }) => {
    await usePersona(page, "founder");
    await page.goto(`/projects/${projectSlug}/opportunity`);
    await expect(
      page.getByRole("heading", { name: "This room does not exist." }),
    ).toBeVisible();

    await usePersona(page, "scoped_admin");
    await page.goto("/admin/opportunities");
    await expect(
      page.getByRole("heading", { name: "This room is private." }),
    ).toBeVisible();

    await usePersona(page, "superadmin");
    await page.goto("/admin/opportunities");
    await expect(
      page.getByRole("heading", {
        name: "Review listings and Investor eligibility.",
      }),
    ).toBeVisible();
  });

  test("public community proof excludes private, suspended and unverified identities", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "Built around people, not anonymous traffic.",
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Launch Gate project owner")).toBeVisible();
    await expect(page.getByLabel("Launch Gate creator")).toBeVisible();
    await expect(page.getByLabel("Launch Gate investor granted")).toBeVisible();
    await expect(page.getByLabel("Launch Gate suspended")).toHaveCount(0);
    await expect(page.getByLabel("Launch Gate private target")).toHaveCount(0);
    await expect(page.getByLabel("Launch Gate investor")).toHaveCount(0);
  });
});
