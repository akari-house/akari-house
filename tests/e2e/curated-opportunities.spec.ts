import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };
const projectSlug = "opportunity-gate-project";
const confidentialMarker = "CONFIDENTIAL-AKARI-ROOM-EVIDENCE";

const publicSectionMarker = "PUBLIC-STRUCTURED-DEAL-ROOM-EVIDENCE";

type Scenario = {
  projectSlug: string;
  projectId: string;
  documentId: string;
  confidentialMarker: string;
};

type CrossDealScenario = {
  secondProjectSlug: string;
  secondProjectId: string;
  secondDocumentId: string;
  secondConfidentialMarker: string;
};

async function activatePersona(
  page: Page,
  persona: string,
  session = true,
  reuseExisting = true,
) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: {
      session: session ? "true" : "false",
      seedResources: "false",
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

async function seedCrossDeal(page: Page): Promise<CrossDealScenario> {
  const response = await page.request.post(
    "/__test__/opportunities/cross-deal",
    { headers: fixtureHeaders },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<CrossDealScenario>;
}

async function prepareScenario(page: Page): Promise<Scenario> {
  for (const persona of [
    "opp_owner",
    "opp_creator",
    "opp_investor",
    "opp_granted",
    "opp_expired",
    "opp_suspended",
    "opp_private_target",
    "opp_founder",
    "opp_scoped_admin",
    "opp_superadmin",
  ])
    await activatePersona(page, persona, false);
  const scenario = await seedOpportunity(page);
  await page.context().clearCookies();
  return scenario;
}

async function usePersona(page: Page, persona: string) {
  return activatePersona(page, persona, true);
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
      page.getByRole("heading", { name: "Investor Deals Room" }),
    ).toBeVisible();
    await expect(
      page.getByText("A permission-safe public opportunity preview."),
    ).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByText("PUBLIC-AKARI-OPPORTUNITY-EVIDENCE"),
    ).toBeVisible();
    await expect(page.getByText(publicSectionMarker)).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Authorised diligence space" }),
    ).toHaveCount(0);
  });

  test("Creator and claimed Investor roles do not unlock capital information", async ({
    page,
  }) => {
    await usePersona(page, "opp_creator");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText("restricted", { exact: true })).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await usePersona(page, "opp_investor");
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
    await usePersona(page, "opp_granted");
    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByRole("heading", { name: "Authorised diligence space" }),
    ).toBeVisible();
    await expect(page.getByText(confidentialMarker).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Opportunity Gate Diligence.txt" }),
    ).toBeVisible();

    const documentResponse = await page.request.get(
      `/projects/${projectSlug}/documents/${scenario.documentId}`,
    );
    expect(documentResponse.status()).toBe(200);
  });

  test("approval for one opportunity never unlocks a second opportunity", async ({
    page,
  }) => {
    const second = await seedCrossDeal(page);
    await usePersona(page, "opp_granted");

    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText(confidentialMarker).first()).toBeVisible();

    await page.goto(`/deals/${second.secondProjectSlug}`);
    await expect(
      page.getByText("request required", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(second.secondConfidentialMarker)).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "Authorised diligence space" }),
    ).toHaveCount(0);

    const directDocument = await page.request.get(
      `/projects/${second.secondProjectSlug}/documents/${second.secondDocumentId}`,
    );
    expect(directDocument.status()).toBe(404);
  });

  test("expired and revoked access remove private content immediately", async ({
    page,
  }) => {
    const scenario = await seedOpportunity(page);
    await usePersona(page, "opp_expired");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText("expired", { exact: true })).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);

    await usePersona(page, "opp_granted");
    await page.goto(`/deals/${projectSlug}`);
    await expect(page.getByText(confidentialMarker).first()).toBeVisible();

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

  test("current Investor restriction invalidates an existing room and file grant", async ({
    page,
  }) => {
    const scenario = await seedOpportunity(page);
    await usePersona(page, "opp_granted");
    expect(
      (
        await page.request.get(
          `/projects/${projectSlug}/documents/${scenario.documentId}`,
        )
      ).status(),
    ).toBe(200);

    const restriction = await page.request.post(
      "/__test__/opportunities/restrict-investor",
      { headers: fixtureHeaders },
    );
    expect(restriction.status()).toBe(200);

    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByText("verification required", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(confidentialMarker)).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/projects/${projectSlug}/documents/${scenario.documentId}`,
        )
      ).status(),
    ).toBe(404);
  });

  test("Founder ownership and scoped administration remain deny by default", async ({
    page,
  }) => {
    await usePersona(page, "opp_founder");
    await page.goto(`/projects/${projectSlug}/opportunity`);
    await expect(
      page.getByRole("heading", { name: "This room does not exist." }),
    ).toBeVisible();

    await usePersona(page, "opp_scoped_admin");
    await page.goto("/admin/opportunities");
    await expect(
      page.getByRole("heading", { name: "This room is private." }),
    ).toBeVisible();

    await usePersona(page, "opp_superadmin");
    await page.goto("/admin/opportunities");
    await expect(
      page.getByRole("heading", {
        name: "Review listings and Investor eligibility.",
      }),
    ).toBeVisible();
  });

  test("footer Deal Room destination remains usable at mobile width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const link = page.getByRole("link", {
      name: "Investor and Angel Deal Rooms",
    });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/deals");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
