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

  it("keeps the primary and footer navigation on valid destinations", () => {
    for (const destination of [
      "/projects",
      "/deals",
      "/campaigns",
      "/events",
      "/archive",
      "/membership",
    ]) {
      expect(headerSource).toContain(`"${destination}"`);
      expect(footerSource).toContain(`"${destination}"`);
    }
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
