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
  const directory =
    `launch-gate-artifacts/visual-evidence/${testInfo.project.name}`;
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

  test(
    "captures public House and discovery routes",
    async ({ page }, testInfo) => {
      await activatePersona(page, "project_owner", {
        seedResources: true,
        reuseExisting: true,
      });
      await page.context().clearCookies();

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
      const directory =
        `launch-gate-artifacts/visual-evidence/${testInfo.project.name}`;
      mkdirSync(directory, { recursive: true });
      await journey.screenshot({
        path: `${directory}/public-blossom-journey.png`,
        animations: "disabled",
      });
    },
  );

  test("captures Creator workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "creator");
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", {
        name: "Find campaigns, workspace navigation",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-creator");
  });

  test("captures Investor workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "investor");
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", {
        name: "Explore matched Deals, workspace navigation",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-investor");
  });

  test("captures Founder workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "founder");
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("link", {
        name: "Manage projects, workspace navigation",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-founder");
  });

  test("captures Superadmin workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "superadmin");
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(
      page.getByText("Superadmin", { exact: true }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin");
  });
});
