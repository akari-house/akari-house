import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  matchOpportunityToInvestor,
  type InvestorPreferenceProfile,
} from "../app/lib/investor-matching.server";

const profile: InvestorPreferenceProfile = {
  status: "verified",
  sectors: ["Infrastructure", "AI"],
  stages: ["Prototype", "Early revenue"],
  geographies: ["Europe", "GCC"],
  minimumTicket: 10_000,
  maximumTicket: 100_000,
  ticketCurrency: "USD",
  eligibilityNote:
    "Experienced early-stage investor with a documented investment thesis.",
  updatedAt: "2026-07-28T00:00:00.000Z",
  complete: true,
};

describe("investor profile to deal discovery", () => {
  it("scores a full preference and ticket match", () => {
    const match = matchOpportunityToInvestor(profile, {
      sector: "Infrastructure",
      stage: "prototype",
      geography: "Europe",
      minimumParticipation: 25_000,
      raiseCurrency: "USD",
    });

    expect(match.score).toBe(100);
    expect(match.reasons).toEqual([
      "Sector: Infrastructure",
      "Stage: prototype",
      "Region: Europe",
      "Ticket range fits the listed minimum",
    ]);
  });

  it("does not claim a ticket match across currencies", () => {
    const match = matchOpportunityToInvestor(profile, {
      sector: "Infrastructure",
      stage: "prototype",
      geography: "Europe",
      minimumParticipation: 25_000,
      raiseCurrency: "EUR",
    });

    expect(match.score).toBe(100);
    expect(match.reasons).not.toContain(
      "Ticket range fits the listed minimum",
    );
  });

  it("does not personalise discovery until the profile is complete", () => {
    expect(
      matchOpportunityToInvestor(
        { ...profile, complete: false },
        {
          sector: "Infrastructure",
          stage: "prototype",
          geography: "Europe",
          minimumParticipation: 25_000,
          raiseCurrency: "USD",
        },
      ),
    ).toEqual({ score: null, reasons: [] });
  });

  it("keeps every Investor House menu connected to a server-backed view", () => {
    const deals = readFileSync("app/routes/deals.tsx", "utf8");
    expect(deals).toContain('to="/deals?view=saved"');
    expect(deals).toContain('to="/deals?view=requested"');
    expect(deals).toContain('to="/deals?view=approved"');
    expect(deals).toContain('to="/settings/investor"');
    expect(deals).toContain("loadInvestorPreferenceProfile");
    expect(deals).toContain("matchOpportunityToInvestor");
    expect(deals).toContain("opportunity_user_states");
    expect(deals).toContain("data_room_requests");
  });
});
