import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  campaignReconciliation,
  creatorApprovedCompensationCents,
  deriveCampaignCloseoutStatus,
  safeExternalUrl,
} from "../app/lib/campaign-closeout";

describe("R69 campaign settlement reconciliation", () => {
  it("combines final base compensation and approved bonuses exactly once", () => {
    expect(creatorApprovedCompensationCents(45_000, 5_000)).toBe(50_000);
    const result = campaignReconciliation([
      {
        applicationId: "creator-1",
        baseFinalCents: 45_000,
        bonusCents: 5_000,
        settlementFinalCents: null,
        paymentStatus: null,
      },
    ]);
    expect(result.approvedCompensationCents).toBe(50_000);
    expect(result.recordedSettlementCents).toBe(50_000);
    expect(result.outstandingCents).toBe(50_000);
  });

  it("uses a recorded adjustment without mutating approved compensation", () => {
    const result = campaignReconciliation([
      {
        applicationId: "creator-1",
        baseFinalCents: 45_000,
        bonusCents: 5_000,
        settlementFinalCents: 48_000,
        paymentStatus: "paid",
      },
    ]);
    expect(result.approvedCompensationCents).toBe(50_000);
    expect(result.recordedSettlementCents).toBe(48_000);
    expect(result.paidCents).toBe(48_000);
    expect(result.allPaid).toBe(true);
  });

  it("does not call a campaign settled while delivery evidence is unresolved", () => {
    expect(
      deriveCampaignCloseoutStatus({
        campaignEnded: true,
        unresolvedApprovalCount: 1,
        missingFinalMetricCount: 0,
        openDisputeCount: 0,
        allPaid: true,
        reportFinal: false,
        reportDelivered: false,
        closed: false,
        renewalConverted: false,
      }),
    ).toBe("awaiting_approvals");
  });

  it("moves through settlement, reporting, client delivery, close and renewal", () => {
    const base = {
      campaignEnded: true,
      unresolvedApprovalCount: 0,
      missingFinalMetricCount: 0,
      openDisputeCount: 0,
      allPaid: true,
      reportFinal: false,
      reportDelivered: false,
      closed: false,
      renewalConverted: false,
    };
    expect(deriveCampaignCloseoutStatus(base)).toBe("settled");
    expect(deriveCampaignCloseoutStatus({ ...base, reportFinal: true })).toBe(
      "reporting",
    );
    expect(
      deriveCampaignCloseoutStatus({
        ...base,
        reportFinal: true,
        reportDelivered: true,
      }),
    ).toBe("client_delivered");
    expect(
      deriveCampaignCloseoutStatus({
        ...base,
        reportFinal: true,
        reportDelivered: true,
        closed: true,
      }),
    ).toBe("closed");
    expect(
      deriveCampaignCloseoutStatus({
        ...base,
        reportFinal: true,
        reportDelivered: true,
        closed: true,
        renewalConverted: true,
      }),
    ).toBe("renewed");
  });

  it("accepts only external HTTP(S) references", () => {
    expect(
      safeExternalUrl("https://drive.google.com/file/d/example"),
    ).toContain("https://drive.google.com");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("R69 production wiring and safety", () => {
  it("registers a dedicated non-IIO closeout route", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const closeout = readFileSync("app/routes/campaign-closeout.tsx", "utf8");
    expect(routes).toContain(
      'route("campaigns/:slug/closeout", "routes/campaign-closeout.tsx")',
    );
    expect(closeout).toContain('campaign.campaignKind === "iio"');
    expect(closeout).toContain(
      "requireCampaignOperator(request, db, campaign.id)",
    );
    expect(closeout).toContain("assertSameOrigin(request)");
  });

  it("uses generic campaign settlements as the canonical paid state", () => {
    const closeout = readFileSync("app/routes/campaign-closeout.tsx", "utf8");
    expect(closeout).toContain("INSERT INTO campaign_settlements");
    expect(closeout).toContain('paymentStatus === "paid"');
    expect(closeout).toContain("campaign.payment_confirmed");
    expect(closeout).toContain(
      "A paid settlement requires a payment method and transaction or evidence reference.",
    );
  });

  it("does not overwrite base final payout with the all-in settlement total", () => {
    const closeout = readFileSync("app/routes/campaign-closeout.tsx", "utf8");
    expect(closeout).not.toContain(
      "UPDATE campaign_applications SET final_payout_cents",
    );
  });

  it("keeps client acknowledgement operational rather than legal", () => {
    const closeout = readFileSync("app/routes/campaign-closeout.tsx", "utf8");
    expect(closeout).toContain(
      "This is an operational CRM marker only. It is not a legal signature",
    );
    expect(closeout).toContain("or agreement workflow.");
  });

  it("uses an additive closeout migration with external reference links", () => {
    const migration = readFileSync(
      "migrations/0115_campaign_closeout_renewal.sql",
      "utf8",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS campaign_closeouts",
    );
    expect(migration).toContain("report_reference_url");
    expect(migration).toContain("renewal_reference_url");
    expect(migration).not.toMatch(
      /DROP TABLE|DELETE FROM|ALTER TABLE .* DROP/i,
    );
  });
});