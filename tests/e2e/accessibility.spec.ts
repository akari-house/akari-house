import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public homepage has no serious accessibility violations", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop-chromium", "mobile-chromium"].includes(testInfo.project.name),
    "Axe coverage runs on representative desktop and mobile Chromium",
  );
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) =>
      ["critical", "serious"].includes(impact ?? ""),
    ),
  ).toEqual([]);
});

test("membership action is inert until a role is selected", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One browser is sufficient for interaction semantics",
  );
  await page.goto("/#membership");
  await expect(
    page.getByRole("button", { name: "Continue to membership" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /Founder/ }).check();
  await expect(
    page.getByRole("link", { name: /Continue to membership/ }),
  ).toHaveAttribute("href", "/register?role=founder");
});
