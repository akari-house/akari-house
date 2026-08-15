import { expect, test } from "@playwright/test";
import {
  activatePersona,
  capture,
  expectNoHorizontalOverflow,
  expectRoleEntry,
} from "./launch-evidence-helpers";

test.describe("launch visual evidence", () => {
  test("captures public House and discovery routes", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "public-home");

    await page.goto("/projects", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "public-projects");

    await page.goto("/campaigns", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Ambassador Campaigns" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "public-campaigns");

    await page.goto("/deals", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Deals" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "public-deals");
  });

  test("captures Creator workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "creator", { reuseExisting: true });
    await page.goto("/app", { waitUntil: "networkidle" });
    await expectRoleEntry(
      page,
      testInfo,
      "Keep your Creator profile campaign-ready",
      /Become campaign-ready|Discover Ambassador Campaigns|Track your campaign applications|Continue your accepted campaign work/,
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
      "Set your investment preferences",
      /Complete your investment preferences|Submit your Investor profile for verification|Your Investor verification is under review|Review relevant opportunities|Track your expressed Project interest|Continue your active Founder relationships/,
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

  test("captures Superadmin workspace", async ({ page }, testInfo) => {
    await activatePersona(page, "superadmin", { reuseExisting: true });
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
      page.getByRole("heading", { name: "Activation and outcome intelligence" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, "workspace-superadmin-activation");
  });
});
