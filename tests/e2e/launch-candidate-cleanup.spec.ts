import { expect, test } from "@playwright/test";

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

  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
