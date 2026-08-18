import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  agreementAttentionRank,
  agreementExpiryState,
  agreementNeedsFollowUp,
  normalizeExternalAgreementUrl,
} from "../app/lib/agreement-tracking";

describe("R70 agreement tracking", () => {
  it("accepts HTTPS external references and rejects unsafe protocols", () => {
    expect(
      normalizeExternalAgreementUrl("https://drive.google.com/file/d/example"),
    ).toContain("https://drive.google.com/");
    expect(
      normalizeExternalAgreementUrl("http://example.com/agreement"),
    ).toBeNull();
    expect(normalizeExternalAgreementUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalAgreementUrl("")).toBe("");
  });

  it("marks due follow-ups without treating closed states as work", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    expect(agreementNeedsFollowUp("sent", "2026-08-16", now)).toBe(true);
    expect(agreementNeedsFollowUp("sent", "2026-08-17", now)).toBe(false);
    expect(agreementNeedsFollowUp("terminated", "2026-08-15", now)).toBe(false);
  });

  it("separates expired, expiring and current external agreements", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    expect(agreementExpiryState("signed", "2026-08-15", now)).toBe("expired");
    expect(agreementExpiryState("signed", "2026-09-01", now)).toBe("expiring");
    expect(agreementExpiryState("signed", "2027-08-16", now)).toBe("current");
  });

  it("prioritizes a due follow-up ahead of passive signed records", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    expect(
      agreementAttentionRank({
        status: "sent",
        nextFollowUpAt: "2026-08-15",
        expiresAt: null,
        now,
      }),
    ).toBeLessThan(
      agreementAttentionRank({
        status: "signed",
        nextFollowUpAt: null,
        expiresAt: "2027-08-16",
        now,
      }),
    );
  });

  it("keeps legal work outside House and redirects the legacy route to AKARI CRM", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const boundary = readFileSync(
      "app/routes/crm-boundary-agreements.ts",
      "utf8",
    );
    const sharedRedirect = readFileSync(
      "app/routes/crm-boundary-redirect.ts",
      "utf8",
    );
    expect(routes).toContain(
      'route("admin/agreements", "routes/crm-boundary-agreements.ts")',
    );
    expect(boundary).toContain('from "./crm-boundary-redirect"');
    expect(sharedRedirect).toContain("crmProductBoundary.url");
    expect(sharedRedirect).not.toContain("Generate agreement");
    expect(sharedRedirect).not.toContain("AI contract");
    expect(sharedRedirect).not.toContain("e-signature");
  });

  it("preserves the additive agreement metadata schema without document blobs", () => {
    const migration = readFileSync(
      "migrations/0116_agreement_tracking.sql",
      "utf8",
    );
    expect(migration).toContain("CREATE TABLE agreement_records");
    expect(migration).toContain("external_document_url");
    expect(migration).not.toContain("BLOB");
  });
});
