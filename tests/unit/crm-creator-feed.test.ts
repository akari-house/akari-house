import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPublicCreatorRow } from "../../app/lib/crm-creator-feed.server";

const read = (path: string) => readFileSync(path, "utf8");

const baseRow = {
  userId: "usr_creator_1",
  username: "alice",
  displayName: "Alice Creator",
  headline: "Crypto educator",
  location: "Berlin",
  websiteUrl: "https://alice.example",
  expertise: "FinTech, education",
  openTo: "Creator campaigns",
  avatarKey: "avatar-v1",
  languagesJson: JSON.stringify(["English", "German"]),
  showLocation: 0,
  showLanguages: 0,
  creatorVerificationStatus: "verified",
  sorsaScore: 640,
  sorsaSource: "partner_verified",
  xScore: 720,
  xScoreSource: "partner_verified",
};

describe("AKARI House public-safe CRM Creator feed", () => {
  it("keeps the stable House identity while respecting profile privacy switches", () => {
    const creator = mapPublicCreatorRow(baseRow, [
      {
        platform: "x",
        profileUrl: "https://x.com/alice",
        followerCount: 25000,
        countSource: "member_reported",
        syncStatus: "manual",
        lastSyncedAt: null,
      },
    ]);

    expect(creator.akariCreatorId).toBe("usr_creator_1");
    expect(creator.profileUrl).toBe("https://akarihouse.com/profiles/alice");
    expect(creator.location).toBe("");
    expect(creator.languages).toEqual([]);
    expect(creator.profileDataStatus).toBe("PROFILE_PROVIDED");
    expect(creator.socials[0]?.countSource).toBe("member_reported");
    expect(creator.sorsaSource).toBe("partner_verified");
  });

  it("exposes location and languages only when the member opted to show them", () => {
    const creator = mapPublicCreatorRow(
      { ...baseRow, showLocation: 1, showLanguages: 1 },
      [],
    );
    expect(creator.location).toBe("Berlin");
    expect(creator.languages).toEqual(["English", "German"]);
  });

  it("enforces public Creator eligibility and excludes private contact data at the source", () => {
    const source = read("app/lib/crm-creator-feed.server.ts");
    const route = read("app/routes/crm-creator-feed.ts");
    expect(source).toContain("ur.role = 'creator'");
    expect(source).toContain("u.status = 'active'");
    expect(source).toContain(
      "COALESCE(pv.visibility, p.visibility) = 'public'",
    );
    expect(source).not.toContain("contact_value");
    expect(source).not.toContain("email AS");
    expect(route).toContain('"X-Robots-Tag": "noindex, nofollow"');
    expect(route).toContain('"Cache-Control":');
    expect(route).toContain(
      '"public, max-age=60, s-maxage=120, stale-while-revalidate=300"',
    );
  });
});
