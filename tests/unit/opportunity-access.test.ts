import { describe, expect, it } from "vitest";
import { resolveOpportunityListingAccess } from "../../app/lib/opportunity-access.server";

const now = Date.parse("2026-07-26T12:00:00.000Z");

describe("opportunity access policy", () => {
  it("denies missing and unpublished listings", () => {
    expect(resolveOpportunityListingAccess(null, now)).toBe("restricted");
    expect(
      resolveOpportunityListingAccess(
        {
          accessMode: "verified_investors",
          listingStatus: "draft",
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
          requestStatus: null,
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
  });
});
