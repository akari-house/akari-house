import { describe, expect, it } from "vitest";
import {
  googleSheetValues,
  parseIioSheetReviews,
} from "../app/lib/google-sheets.server";

describe("Google Sheets IIO export", () => {
  it("builds private payout formulas without exporting contact email", () => {
    const values = googleSheetValues(
      {
        id: "campaign-1",
        slug: "first-light",
        title: "First Light",
        projectTitle: "AKARI",
        budgetCents: 500_000,
        currency: "USD",
        weightFollowers: 40,
        weightXScore: 30,
        weightSorsaScore: 30,
      },
      [
        {
          id: "application-1",
          creatorName: "Creator",
          xUrl: "https://x.com/creator",
          tiktokUrl: "",
          instagramUrl: "",
          youtubeUrl: "",
          xFollowers: 1000,
          xScore: 75,
          sorsaScore: 80,
          status: "accepted",
        },
      ],
    );
    expect(values[0]).not.toContain("Email");
    expect(values[1][12]).toContain("*0.4");
    expect(values[1][14]).toBe("=ROUND(N2*5000,2)");
    expect(values[1][15]).toBe("application-1");
  });

  it("imports only recognized decisions with stable application IDs", () => {
    const values = googleSheetValues(
      {
        id: "campaign-1",
        slug: "first-light",
        title: "First Light",
        projectTitle: "AKARI",
        budgetCents: 500_000,
        currency: "USD",
        weightFollowers: 40,
        weightXScore: 30,
        weightSorsaScore: 30,
      },
      [
        {
          id: "application-1",
          creatorName: "Creator",
          xUrl: "",
          tiktokUrl: "",
          instagramUrl: "",
          youtubeUrl: "",
          xFollowers: 1250,
          xScore: 70,
          sorsaScore: 80,
          status: "accepted",
        },
      ],
    );
    expect(parseIioSheetReviews(values)).toEqual([
      {
        applicationId: "application-1",
        status: "accepted",
        xFollowers: 1250,
        xScore: 70,
        sorsaScore: 80,
      },
    ]);
  });
});
