import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveOpportunityListingAccess } from "../../app/lib/opportunity-access.server";

const now = Date.parse("2026-07-26T12:00:00.000Z");

describe("opportunity access policy", () => {
  it("denies missing, draft and archived listings", () => {
    expect(resolveOpportunityListingAccess(null, now)).toBe("restricted");
    for (const listingStatus of ["draft", "archived"])
      expect(
        resolveOpportunityListingAccess(
          {
            accessMode: "verified_investors",
            listingStatus,
            requestStatus: null,
            expiresAt: null,
          },
          now,
        ),
      ).toBe("restricted");
  });

  it("opens verified-investor listings without a separate request", () => {
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "verified_investors",
          listingStatus: "published",
          requestStatus: "revoked",
          expiresAt: null,
        },
        now,
      ),
    ).toBe("approved");
  });

  it("requires a request for approved-only listings", () => {
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "approved_only",
          listingStatus: "published",
          requestStatus: null,
          expiresAt: null,
        },
        now,
      ),
    ).toBe("request_required");
  });

  it("preserves pending, declined and revoked states", () => {
    for (const [requestStatus, expected] of [
      ["pending", "requested"],
      ["declined", "declined"],
      ["revoked", "revoked"],
      ["expired", "expired"],
    ] as const)
      expect(
        resolveOpportunityListingAccess(
          {
            accessMode: "approved_only",
            listingStatus: "published",
            requestStatus,
            expiresAt: null,
          },
          now,
        ),
      ).toBe(expected);
  });

  it("expires an approved request at the server boundary", () => {
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "approved_only",
          listingStatus: "published",
          requestStatus: "approved",
          expiresAt: "2026-07-26T11:59:59.000Z",
        },
        now,
      ),
    ).toBe("expired");
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "approved_only",
          listingStatus: "published",
          requestStatus: "approved",
          expiresAt: "2026-07-27T12:00:00.000Z",
        },
        now,
      ),
    ).toBe("approved");
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "approved_only",
          listingStatus: "published",
          requestStatus: "approved",
          expiresAt: null,
        },
        now,
      ),
    ).toBe("approved");
  });

  it("selects only the latest access request for a project and Investor", () => {
    const source = readFileSync("app/lib/opportunity-access.server.ts", "utf8");
    expect(source).toContain(
      "ORDER BY request.created_at DESC, request.id DESC",
    );
    expect(source).toContain("LIMIT 1");
  });

  it("rechecks Deal Room state before private document delivery", () => {
    const source = readFileSync("app/routes/project-document.ts", "utf8");
    expect(source).toContain("opportunityAccessState");
    expect(source).toContain('roomState === "approved"');
    expect(source).toContain("document.approvedAt");
    expect(source).toContain('throw new Response("Document not found."');
  });

  it("uses scoped administration rather than a universal admin row", () => {
    const source = readFileSync("app/routes/deal-room.tsx", "utf8");
    expect(source).toContain('hasAdminScope(db, user.id, "projects")');
    expect(source).not.toContain(
      'prepare("SELECT 1 FROM admin_users WHERE user_id = ?")',
    );
  });
});
