import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };
const origin = "http://127.0.0.1:5173";

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

async function securityAction<T>(
  page: Page,
  action: string,
  form: Record<string, string>,
) {
  const response = await page.request.post(
    `/__test__/launch-security/${action}`,
    {
      headers: fixtureHeaders,
      form,
    },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
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

test.describe("launch-gate security completion", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Security mutation evidence runs once on desktop Chromium.",
    );
    await page.context().clearCookies();
  });

  test("[password_reset:founder] password reset consumes the token and destroys every session", async ({
    page,
  }) => {
    await activatePersona(page, "founder");
    await activatePersona(page, "founder", true, false, true);
    const before = await securityAction<{
      sessions: number;
      activeResetTokens: number;
    }>(page, "account-state", { persona: "founder" });
    expect(before.sessions).toBe(2);

    const issued = await securityAction<{ token: string }>(
      page,
      "password-reset",
      { persona: "founder" },
    );
    const password = "Launch-gate-reset-password-2026";
    const reset = await page.request.post("/reset-password", {
      headers: { Origin: origin },
      form: {
        token: issued.token,
        password,
        confirmation: password,
      },
    });
    expect(reset.status()).toBe(200);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);
    const after = await securityAction<{
      sessions: number;
      activeResetTokens: number;
    }>(page, "account-state", { persona: "founder" });
    expect(after.sessions).toBe(0);
    expect(after.activeResetTokens).toBe(0);

    const replay = await page.request.post("/reset-password", {
      headers: { Origin: origin },
      form: {
        token: issued.token,
        password,
        confirmation: password,
      },
    });
    expect(replay.status()).toBe(200);
    expect(await replay.text()).toContain("invalid");
  });

  test("[status_invalidation:status_target] moderation suspension deletes the active session immediately", async ({
    page,
  }) => {
    await activatePersona(page, "founder", false);
    await activatePersona(page, "status_target");
    const targetCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "akari_session",
    );
    expect(targetCookie).toBeTruthy();

    await activatePersona(page, "moderator");
    const { reportId } = await securityAction<{ reportId: string }>(
      page,
      "moderation-report",
      {
        targetPersona: "status_target",
        reporterPersona: "founder",
      },
    );
    const decision = await page.request.post("/admin/moderation", {
      headers: { Origin: origin },
      form: {
        reportId,
        intent: "resolve",
        enforcement: "suspend_account",
        resolutionNote: "Automated launch-gate suspension evidence.",
      },
    });
    expect(decision.status()).toBe(200);

    await page.context().clearCookies();
    await page.context().addCookies([targetCookie!]);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp$/);

    const state = await securityAction<{
      status: string;
      sessions: number;
    }>(page, "account-state", { persona: "status_target" });
    expect(state.status).toBe("suspended");
    expect(state.sessions).toBe(0);
  });

  test("[diligence_revocation:investor] a revoked grant immediately removes document access and records an audit", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    const documentUrl = `/projects/${resources.projectSlug}/documents/${resources.documentId}`;

    await useExistingPersona(page, "investor_granted");
    expect((await page.request.get(documentUrl)).status()).toBe(200);
    const grant = await securityAction<{
      grantId: string | null;
      activeGrants: number;
    }>(page, "grant-state", {
      projectSlug: resources.projectSlug,
      investorPersona: "investor_granted",
    });
    expect(grant.grantId).toBeTruthy();
    expect(grant.activeGrants).toBe(1);

    await useExistingPersona(page, "project_owner");
    const revoked = await page.request.post(
      `/projects/${resources.projectSlug}/diligence`,
      {
        headers: { Origin: origin },
        form: {
          intent: "revoke-grant",
          grantId: grant.grantId!,
        },
        maxRedirects: 0,
      },
    );
    expect(revoked.status()).toBe(302);

    await useExistingPersona(page, "investor_granted");
    expect((await page.request.get(documentUrl)).status()).toBe(404);
    const after = await securityAction<{
      activeGrants: number;
      revokeAudits: number;
    }>(page, "grant-state", {
      projectSlug: resources.projectSlug,
      investorPersona: "investor_granted",
    });
    expect(after.activeGrants).toBe(0);
    expect(after.revokeAudits).toBeGreaterThanOrEqual(1);
  });

  test("[upload_security:project_owner] spoofed, oversized and unauthorised uploads leave no R2 or D1 records", async ({
    page,
  }) => {
    const resources = await seedOwnershipScenario(page);
    await useExistingPersona(page, "project_owner");
    const before = await securityAction<{
      documents: number;
      objects: number;
    }>(page, "upload-state", { projectSlug: resources.projectSlug });

    const spoofed = await page.request.post(
      `/projects/${resources.projectSlug}/edit`,
      {
        headers: { Origin: origin },
        multipart: {
          intent: "upload-document",
          documentTitle: "Spoofed document",
          projectDocument: {
            name: "../../payload.pdf.exe",
            mimeType: "application/pdf",
            buffer: Buffer.from("<html><script>alert(1)</script></html>"),
          },
        },
      },
    );
    expect(spoofed.status()).toBe(200);

    const oversizedBody = Buffer.alloc(5_242_881, 0x41);
    oversizedBody.set(Buffer.from("%PDF"), 0);
    const oversized = await page.request.post(
      `/projects/${resources.projectSlug}/edit`,
      {
        headers: { Origin: origin },
        multipart: {
          intent: "upload-document",
          documentTitle: "Oversized document",
          projectDocument: {
            name: "oversized.pdf",
            mimeType: "application/pdf",
            buffer: oversizedBody,
          },
        },
      },
    );
    expect(oversized.status()).toBe(200);

    await useExistingPersona(page, "creator_other");
    const unauthorised = await page.request.post(
      `/projects/${resources.projectSlug}/edit`,
      {
        headers: { Origin: origin },
        multipart: {
          intent: "upload-document",
          documentTitle: "Foreign upload",
          projectDocument: {
            name: "foreign.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("%PDF-1.7\nvalid test body"),
          },
        },
      },
    );
    expect(unauthorised.status()).toBe(404);

    const after = await securityAction<{
      documents: number;
      objects: number;
    }>(page, "upload-state", { projectSlug: resources.projectSlug });
    expect(after).toEqual(before);
  });
});

test("[keyboard_accessibility:visitor] mobile navigation traps focus, closes with Escape and restores focus", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Keyboard drawer evidence runs once on mobile Chromium.",
  );
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Site navigation" });
  await expect(dialog).toBeVisible();
  const close = page.getByRole("button", { name: "Close menu" });
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  const focusedInside = await page.evaluate(() =>
    document.activeElement?.closest("#mobile-menu")
      ? document.activeElement?.textContent?.trim()
      : null,
  );
  expect(focusedInside).toBeTruthy();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
