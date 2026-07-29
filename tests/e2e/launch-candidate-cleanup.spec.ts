import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const fixtureHeaders = { "x-akari-test-fixture": "launch-gate-v1" };

async function activatePersona(page: Page, persona: string) {
  await page.context().clearCookies();
  const response = await page.request.post(`/__test__/personas/${persona}`, {
    headers: fixtureHeaders,
    form: { session: "true" },
  });
  expect(response.status()).toBe(201);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test("Blossom Journey connectors remain between adjacent nodes", async ({
  page,
}) => {
  await page.goto("/");
  const branch = page.locator(".blossom-branch");
  await branch.scrollIntoViewIfNeeded();
  await expect(branch).toBeVisible();

  const nodes = branch.locator("button > span");
  const connectors = branch.locator(".journey-connector");
  await expect(nodes).toHaveCount(5);
  await expect(connectors).toHaveCount(4);

  const viewport = page.viewportSize();
  const vertical = (viewport?.width ?? 1280) <= 700;

  for (let index = 0; index < 4; index += 1) {
    const previous = await nodes.nth(index).boundingBox();
    const connector = await connectors.nth(index).boundingBox();
    const next = await nodes.nth(index + 1).boundingBox();

    expect(previous).not.toBeNull();
    expect(connector).not.toBeNull();
    expect(next).not.toBeNull();
    if (!previous || !connector || !next) continue;

    if (vertical) {
      expect(connector.y).toBeGreaterThanOrEqual(
        previous.y + previous.height - 1,
      );
      expect(connector.y + connector.height).toBeLessThanOrEqual(next.y + 1);
    } else {
      expect(connector.x).toBeGreaterThanOrEqual(
        previous.x + previous.width - 1,
      );
      expect(connector.x + connector.width).toBeLessThanOrEqual(next.x + 1);
    }
  }
});

test("public pages are canonical while private utility pages are noindex", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://akarihouse.com/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /index, follow/,
  );
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(
    1,
  );

  const loginResponse = await page.goto("/login");
  expect(loginResponse?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("Creator and Investor workspaces expose their primary task first", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Role-first navigation evidence runs once on desktop Chromium.",
  );

  await activatePersona(page, "creator");
  await page.goto("/app");
  await expect(
    page.getByRole("link", {
      name: "Find campaigns, workspace navigation",
    }),
  ).toHaveAttribute("href", "/campaigns");
  await expect(
    page.getByRole("link", { name: /Find Creator campaigns/ }),
  ).toHaveAttribute("href", "/campaigns");

  await activatePersona(page, "investor");
  await page.goto("/app");
  await expect(
    page.getByRole("link", {
      name: "Explore matched Deals, workspace navigation",
    }),
  ).toHaveAttribute("href", "/deals");
  await expect(
    page.getByRole("link", { name: /Review matched Deals/ }),
  ).toHaveAttribute("href", "/deals");
});

test("key mobile discovery and member pages remain accessible without overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Representative mobile accessibility evidence runs once on Chromium.",
  );

  for (const route of ["/campaigns", "/deals"]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  }

  await activatePersona(page, "creator");
  await page.goto("/app");
  await expectNoHorizontalOverflow(page);
  const memberResults = await new AxeBuilder({ page }).analyze();
  expect(
    memberResults.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
