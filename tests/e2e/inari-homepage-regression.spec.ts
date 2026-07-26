import { expect, test } from "@playwright/test";

test.describe("approved Inari homepage", () => {
  test("renders the House journey without overflow or footer collisions", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "Welcome to AKARI House" }),
    ).toBeVisible();
    await expect(page.getByText("The lantern went out unexpectedly.")).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "AKARI House home" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const footer = document.querySelector("footer");
      if (!footer)
        return {
          overflow: true,
          collisions: ["footer missing"],
          outside: ["footer missing"],
        };

      const blocks = [
        ...footer.querySelectorAll<HTMLElement>(
          "a, p, small, strong, h2, .footer-brand",
        ),
      ].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      const footerRect = footer.getBoundingClientRect();
      const collisions: string[] = [];
      const outside: string[] = [];

      for (const [index, element] of blocks.entries()) {
        const rect = element.getBoundingClientRect();
        const label = element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
          element.tagName;
        if (
          rect.left < footerRect.left - 1 ||
          rect.right > footerRect.right + 1 ||
          rect.top < footerRect.top - 1 ||
          rect.bottom > footerRect.bottom + 1
        )
          outside.push(label);

        for (const other of blocks.slice(index + 1)) {
          if (element.contains(other) || other.contains(element)) continue;
          const otherRect = other.getBoundingClientRect();
          const overlapWidth =
            Math.min(rect.right, otherRect.right) -
            Math.max(rect.left, otherRect.left);
          const overlapHeight =
            Math.min(rect.bottom, otherRect.bottom) -
            Math.max(rect.top, otherRect.top);
          if (overlapWidth > 2 && overlapHeight > 2) {
            const otherLabel =
              other.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ||
              other.tagName;
            collisions.push(`${label} <> ${otherLabel}`);
          }
        }
      }

      return {
        overflow: root.scrollWidth > window.innerWidth + 1,
        collisions,
        outside,
      };
    });

    expect(layout.overflow).toBe(false);
    expect(layout.outside).toEqual([]);
    expect(layout.collisions).toEqual([]);
  });
});
