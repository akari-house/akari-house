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
      /Find Creator campaigns/,
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
      /Review matched Deals/,
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
      /Manage your Founder work/,
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-founder");
  });

  test("captures Superadmin workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "superadmin", { reuseExisting: true });
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByText("Superadmin", { exact: true }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin");
  });
});
