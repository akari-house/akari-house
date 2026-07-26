import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };
const projectSlug = "opportunity-gate-project";

type Scenario = {
  documentId: string;
};

async function activatePersona(page: Page, persona: string, session = true) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: {
      session: session ? "true" : "false",
      seedResources: "false",
      reuseExisting: "true",
    },
  });
  expect(response.status()).toBe(201);
}

async function prepareScenario(page: Page): Promise<Scenario> {
  for (const persona of [
    "opp_owner",
    "opp_granted",
    "opp_expired",
    "opp_investor",
    "opp_creator",
    "opp_scoped_admin",
    "opp_superadmin",
  ])
    await activatePersona(page, persona, false);
  const response = await page.request.post("/__test__/opportunities/seed", {
    headers: fixtureHeaders,
  });
  expect(response.status()).toBe(200);
  await page.context().clearCookies();
  return response.json() as Promise<Scenario>;
}

async function usePersona(page: Page, persona: string) {
  await activatePersona(page, persona, true);
}

async function documentState(page: Page) {
  const response = await page.request.post(
    "/__test__/opportunity-documents/state",
    { headers: fixtureHeaders },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    documentId: string;
    approved: boolean;
    activeGrants: number;
  }>;
}

function opportunityDocumentCard(page: Page) {
  return page.locator("article.application-card").filter({
    has: page.getByRole("heading", {
      name: "Opportunity Gate Diligence.txt",
    }),
  });
}

test.describe("private opportunity document review", () => {
  test.describe.configure({ mode: "serial" });

  test("approval controls delivery and withdrawal revokes active grants", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Private document mutation evidence runs once on desktop Chromium.",
    );
    const scenario = await prepareScenario(page);
    const documentUrl = `/projects/${projectSlug}/documents/${scenario.documentId}`;

    await usePersona(page, "opp_granted");
    expect((await page.request.get(documentUrl)).status()).toBe(200);

    const unapprove = await page.request.post(
      "/__test__/opportunity-documents/unapprove",
      { headers: fixtureHeaders },
    );
    expect(unapprove.status()).toBe(200);
    expect((await page.request.get(documentUrl)).status()).toBe(404);
    await page.goto(`/deals/${projectSlug}`);
    await expect(
      page.getByRole("link", { name: "Opportunity Gate Diligence.txt" }),
    ).toHaveCount(0);

    await usePersona(page, "opp_scoped_admin");
    await page.goto("/admin/opportunities/documents");
    await expect(
      page.getByRole("heading", { name: "This room is private." }),
    ).toBeVisible();

    await usePersona(page, "opp_superadmin");
    await page.goto("/admin/opportunities/documents");
    await expect(
      page.getByRole("heading", {
        name: "Approve what can enter a private room.",
      }),
    ).toBeVisible();
    const approvalCard = opportunityDocumentCard(page);
    await expect(approvalCard).toBeVisible();
    await approvalCard.getByLabel("Category").selectOption("financial");
    await approvalCard.getByLabel("Access class").selectOption("confidential");
    await approvalCard
      .getByLabel("Decision note")
      .fill("Approved for controlled automated diligence evidence.");
    await approvalCard
      .getByRole("button", { name: "Approve document" })
      .click();
    await expect(
      page.getByText("Document approved for controlled room access."),
    ).toBeVisible();
    await expect(documentState(page)).resolves.toMatchObject({
      approved: true,
      activeGrants: 1,
    });

    await usePersona(page, "opp_granted");
    expect((await page.request.get(documentUrl)).status()).toBe(200);

    await usePersona(page, "opp_superadmin");
    await page.goto("/admin/opportunities/documents");
    const withdrawalCard = opportunityDocumentCard(page);
    await expect(withdrawalCard).toBeVisible();
    await withdrawalCard
      .getByLabel("Decision note")
      .fill("Withdrawing approval must revoke every active grant immediately.");
    await withdrawalCard
      .getByRole("button", { name: "Withdraw approval" })
      .click();
    await expect(
      page.getByText("Document approval withdrawn and active grants revoked."),
    ).toBeVisible();
    await expect(documentState(page)).resolves.toMatchObject({
      approved: false,
      activeGrants: 0,
    });

    await usePersona(page, "opp_granted");
    expect((await page.request.get(documentUrl)).status()).toBe(404);
  });
});
