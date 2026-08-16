import { randomUUID } from "node:crypto";
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

test.describe("R70 agreement tracking", () => {
  test("records an external agreement lifecycle without storing legal content", async ({
    page,
  }, testInfo) => {
    await activatePersona(page, "superadmin");
    await page.goto("/admin/agreements", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Agreement tracking" }),
    ).toBeVisible();
    await expect(page.getByText("Operational tracking only.")).toBeVisible();

    const runId = randomUUID();
    const title = `R70 Service Agreement ${testInfo.project.name} ${runId}`;
    const createForm = page.locator("form.agreement-tracking-form").first();
    await createForm.getByLabel("Agreement title", { exact: true }).fill(title);
    await createForm
      .getByLabel("Agreement type", { exact: true })
      .selectOption("service");
    await createForm.getByLabel("Stage", { exact: true }).selectOption("sent");
    await createForm
      .getByLabel("Counterparty", { exact: true })
      .fill("R70 Test Client");
    await createForm
      .getByLabel("Counterparty email", { exact: true })
      .fill(`r70-${runId}@example.com`);
    await createForm
      .getByLabel("Next follow-up", { exact: true })
      .fill("2026-08-16");
    await createForm
      .getByLabel("Operational note", { exact: true })
      .fill(
        "Lawyer prepared the agreement externally and it was sent to the client.",
      );
    await createForm
      .getByRole("button", { name: "Create tracking record" })
      .click();
    await page.waitForLoadState("networkidle");

    const record = page
      .locator("details.agreement-card")
      .filter({ hasText: title });
    await expect(record).toHaveCount(1);
    await expect(record).toBeVisible();
    await expect(record.getByText("Follow-up due")).toBeVisible();
    await record.locator("summary").click();

    const updateForm = record.locator("form.agreement-tracking-form");
    await updateForm
      .getByLabel("Stage", { exact: true })
      .selectOption("signed");
    await updateForm
      .getByLabel("External document link", { exact: true })
      .fill(`https://drive.google.com/file/d/${runId}`);
    await updateForm
      .getByLabel("Signed externally", { exact: true })
      .fill("2026-08-16");
    await updateForm
      .getByLabel("Effective", { exact: true })
      .fill("2026-08-16");
    await updateForm.getByLabel("Expires", { exact: true }).fill("2027-08-16");
    await updateForm
      .getByRole("button", { name: "Update tracking record" })
      .click();
    await page.waitForLoadState("networkidle");

    const updated = page
      .locator("details.agreement-card")
      .filter({ hasText: title });
    await expect(updated).toHaveCount(1);
    await expect(
      updated.getByText("Signed externally", { exact: true }),
    ).toBeVisible();
    await updated.locator("summary").click();
    await expect(
      updated.getByRole("link", { name: "Open external agreement ↗" }),
    ).toHaveAttribute("href", new RegExp(runId));
  });

  test("rejects a Founder from confidential agreement operations", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    const response = await page.goto("/admin/agreements");
    expect(response?.status()).toBe(403);
  });
});
