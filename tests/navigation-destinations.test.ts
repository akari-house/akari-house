import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("app/routes.ts", "utf8");
const headerSource = readFileSync("app/components/SiteHeader.tsx", "utf8");
const footerSource = readFileSync("app/components/PublicFooter.tsx", "utf8");

const publicDestinations = [
  "/projects",
  "/deals",
  "/campaigns",
  "/events",
  "/archive",
  "/membership",
  "/community-guidelines",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/register",
];

const protectedDestinations = [
  "/app",
  "/members",
  "/connections",
  "/notifications",
  "/settings/account",
  "/settings/telegram",
  "/settings/investor",
];

const superadminDestinations = ["/admin/house-directory", "/admin/team"];

describe("navigation destinations", () => {
  it("maps every public menu destination to an application route", () => {
    expect(routeSource).toContain('index("routes/home.tsx")');
    for (const destination of publicDestinations)
      expect(routeSource).toContain(`route("${destination.slice(1)}"`);
  });

  it("maps every signed-in menu destination to a protected route", () => {
    for (const destination of protectedDestinations)
      expect(routeSource).toContain(`route("${destination.slice(1)}"`);
  });

  it("keeps Superadmin people and partner controls on protected routes", () => {
    const dashboardSource = readFileSync("app/routes/dashboard.tsx", "utf8");
    const directorySource = readFileSync(
      "app/routes/admin-house-directory.tsx",
      "utf8",
    );

    for (const destination of superadminDestinations) {
      expect(routeSource).toContain(`route("${destination.slice(1)}"`);
      expect(dashboardSource).toContain(`to="${destination}"`);
    }
    expect(dashboardSource).toContain(
      'loaderData.adminAccess?.accessLevel === "superadmin"',
    );
    expect(directorySource).toContain("requireSuperAdmin");
  });

  it("keeps the simplified primary navigation and footer on valid destinations", () => {
    for (const destination of [
      "/projects",
      "/campaigns",
      "/events",
      "/membership",
    ]) {
      expect(headerSource).toContain(`"${destination}"`);
      expect(footerSource).toContain(`"${destination}"`);
    }

    expect(headerSource).toContain('["Members", "/members"]');
    expect(headerSource).toContain('["Opportunities", "/deals"]');
    expect(footerSource).toContain('"/archive"');
  });

  it("keeps schema-safe behaviour in the canonical deal routes", () => {
    expect(routeSource).toContain('route("deals", "routes/deals.tsx")');
    expect(routeSource).toContain(
      'route("deals/:dealSlug", "routes/deal-room.tsx")',
    );
    expect(readFileSync("app/routes/deals.tsx", "utf8")).toContain(
      "isOpportunitySchemaUnavailable",
    );
    expect(readFileSync("app/routes/deal-room.tsx", "utf8")).toContain(
      "isOpportunitySchemaUnavailable",
    );
  });
});
