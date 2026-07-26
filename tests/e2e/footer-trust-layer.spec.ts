import { expect, test } from "@playwright/test";

test("public footer remains readable with a restrained AKARI horizon", async ({
  page,
}) => {
  await page.goto("/");
  const footer = page.locator(".akari-footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();

  const disclosureHeading = page.getByRole("heading", {
    name: "Discovery is not a guarantee.",
  });
  await expect(disclosureHeading).toBeVisible();
  const headingSize = await disclosureHeading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  expect(headingSize).toBeLessThanOrEqual(35);

  const landscape = footer.locator("[data-footer-landscape]");
  await expect(landscape).toHaveClass(/is-visible/);
  await expect(landscape.locator(".akari-footer__house")).toHaveCount(4);
  await expect(landscape.locator(".akari-footer__torii")).toHaveCount(1);
  await expect(landscape.locator(".akari-footer__grass")).toHaveCount(1);

  const result = await footer.evaluate((element) => {
    const root = element as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".akari-footer__group, .akari-footer__disclosure header, .akari-footer__disclosure-copy p",
      ),
    ).filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0
      );
    });

    const collisions: string[] = [];
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < nodes.length;
        secondIndex += 1
      ) {
        const first = nodes[firstIndex].getBoundingClientRect();
        const second = nodes[secondIndex].getBoundingClientRect();
        const horizontal =
          Math.min(first.right, second.right) -
          Math.max(first.left, second.left);
        const vertical =
          Math.min(first.bottom, second.bottom) -
          Math.max(first.top, second.top);
        if (horizontal > 1 && vertical > 1)
          collisions.push(`${firstIndex}:${secondIndex}`);
      }
    }

    const outside = nodes
      .map((node, index) => ({ index, rect: node.getBoundingClientRect() }))
      .filter(
        ({ rect }) =>
          rect.left < rootRect.left - 1 || rect.right > rootRect.right + 1,
      )
      .map(({ index }) => index);

    return {
      documentOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      footerOverflow: root.scrollWidth - root.clientWidth,
      collisions,
      outside,
    };
  });

  expect(result.documentOverflow).toBeLessThanOrEqual(0);
  expect(result.footerOverflow).toBeLessThanOrEqual(0);
  expect(result.collisions).toEqual([]);
  expect(result.outside).toEqual([]);
});

test("footer horizon respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const landscape = page.locator("[data-footer-landscape]");
  await landscape.scrollIntoViewIfNeeded();
  await expect(landscape).toHaveClass(/is-visible/);
  const longestTransition = await landscape.evaluate((element) =>
    Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(",")
        .map((value) => Number.parseFloat(value) || 0),
    ),
  );
  expect(longestTransition).toBeLessThanOrEqual(0.001);
  await expect(landscape).toHaveCSS("transform", "none");
});
