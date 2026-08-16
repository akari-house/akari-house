import { mkdirSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activatePersona(
  page: Page,
  persona: string,
  options: { seedResources?: boolean; reuseExisting?: boolean } = {},
) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: {
      session: "true",
      seedResources: options.seedResources ? "true" : "false",
      reuseExisting: options.reuseExisting ? "true" : "false",
    },
  });
  expect(response.status()).toBe(201);
}

async function preparePage(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0ms !important;
        transition-duration: 0.001ms !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(async () => {
    if ("fonts" in document) await document.fonts.ready;
  });
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: { fullPage?: boolean } = {},
) {
  const directory = `launch-gate-artifacts/visual-evidence/${testInfo.project.name}`;
  mkdirSync(directory, { recursive: true });
  await preparePage(page);
  await page.screenshot({
    path: `${directory}/${name}.png`,
    fullPage: options.fullPage ?? true,
    animations: "disabled",
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

function visualEvidenceProject(testInfo: TestInfo) {
  return ["desktop-chromium", "mobile-chromium"].includes(
    testInfo.project.name,
  );
}

async function expectRoleEntry(
  page: Page,
  testInfo: TestInfo,
  desktopName: string,
  mobileName: RegExp,
) {
  const roleEntry =
    testInfo.project.name === "mobile-chromium"
      ? page.getByRole("link", { name: mobileName })
      : page.getByRole("link", { name: desktopName });
  await expect(roleEntry.first()).toBeVisible();
}

test.describe("launch visual evidence", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      process.env.AKARI_CAPTURE_LAUNCH_EVIDENCE !== "1" ||
        !visualEvidenceProject(testInfo),
      "Visual evidence is captured only by the Launch Gate evidence workflow.",
    );
    await page.context().clearCookies();
  });

  test("captures public House and discovery routes", async ({
    page,
  }, testInfo) => {
    for (const [route, name] of [
      ["/", "public-home"],
      ["/projects", "public-projects"],
      ["/campaigns", "public-campaigns"],
      ["/deals", "public-deals"],
    ] as const) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, name);
    }

    await page.goto("/", { waitUntil: "networkidle" });
    const journey = page.locator(".blossom-experience");
    await journey.scrollIntoViewIfNeeded();
    await expect(journey).toBeVisible();
    await preparePage(page);
    const directory = `launch-gate-artifacts/visual-evidence/${testInfo.project.name}`;
    mkdirSync(directory, { recursive: true });
    await journey.screenshot({
      path: `${directory}/public-blossom-journey.png`,
      animations: "disabled",
    });
  });

  test("captures Creator workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "creator", { reuseExisting: true });
    await page.goto("/app", { waitUntil: "networkidle" });
    await expectRoleEntry(
      page,
      testInfo,
      "Find campaigns, workspace navigation",
      /Keep your Creator profile campaign-ready|Become campaign-ready|Discover Ambassador Campaigns|Track your campaign applications|Continue your accepted campaign work/,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-creator");
  });

  test("captures Investor workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "investor", { reuseExisting: true });
    await page.goto("/app", { waitUntil: "networkidle" });
    await expectRoleEntry(
      page,
      testInfo,
      "Explore matched Deals, workspace navigation",
      /Set your investment preferences|Complete your investment preferences|Submit your Investor profile for verification|Your Investor verification is under review|Review relevant opportunities|Track your expressed Project interest|Continue your active Founder relationships/,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-investor");
  });

  test("captures Founder workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "founder", { reuseExisting: true });
    await page.goto("/app", { waitUntil: "networkidle" });
    await expectRoleEntry(
      page,
      testInfo,
      "Manage projects, workspace navigation",
      /Create or manage your projects|Create your first Project|Track your Project relationship claim|Finish your Project profile|Activate your published Project|Keep your Project needs current/,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-founder");
  });

  test("captures Superadmin workspace and R69 closeout", async ({
    page,
  }, testInfo) => {
    await activatePersona(page, "founder", { reuseExisting: true });
    await activatePersona(page, "creator_selected", { reuseExisting: true });
    await activatePersona(page, "superadmin", { reuseExisting: true });
    const seedCloseout = await page.request.post(
      "/__test__/campaign-closeout/seed",
      { headers: fixtureHeaders },
    );
    expect(seedCloseout.status()).toBe(201);

    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Admin workspace" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin");

    await page.goto("/admin/reviews", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Unified review inbox" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin-reviews");

    await page.goto("/admin/activation", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", {
        name: "Activation and outcome intelligence",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin-activation");

    await page.goto("/campaigns/launch-gate-closeout/closeout", {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: "R69 Closeout Campaign" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin-campaign-closeout");
  });
});
