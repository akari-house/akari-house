import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { googleCalendarEventUrl } from "../../app/lib/calendar";
import { effectiveRoleVerificationStatus } from "../../app/lib/role-verification.server";
import {
  minimumPostingDays,
  parsePostingDays,
} from "../../app/lib/campaign-posting-days";
import { expectedCampaignSlots } from "../../app/lib/campaign-delivery";
import { isXProfileUrl } from "../../app/lib/validation";

const read = (path: string) => readFileSync(path, "utf8");

describe("public onboarding launch rules", () => {
  it("treats expired verification evidence as expired", () => {
    expect(
      effectiveRoleVerificationStatus({
        role: "investor",
        status: "verified",
        hasProvenance: 1,
        hasCurrentProvenance: 0,
        eligible: 1,
      }),
    ).toBe("expired");
    expect(
      effectiveRoleVerificationStatus({
        role: "founder",
        status: "verified",
        hasProvenance: 1,
        hasCurrentProvenance: 1,
        eligible: 1,
      }),
    ).toBe("verified");
  });

  it("uses Creator-selected weekdays for daily delivery slots", () => {
    const slots = expectedCampaignSlots(
      "2026-08-03",
      "2026-08-09",
      "daily_posting",
      new Date("2026-08-09T12:00:00.000Z"),
      [1, 3, 5],
    );
    expect(slots.map((slot) => slot.periodStart)).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-07",
    ]);
    expect(parsePostingDays("[1,3,3,9]")).toEqual([1, 3]);
    expect(minimumPostingDays("weekly_4")).toBe(4);
    expect(isXProfileUrl("https://x.com/house_akari")).toBe(true);
    expect(isXProfileUrl("https://example.com/house_akari")).toBe(false);
  });

  it("creates a public Google Calendar link without a private meeting URL", () => {
    const url = new URL(
      googleCalendarEventUrl({
        title: "AKARI Gathering",
        summary: "A public gathering.",
        startsAt: "2026-08-03 10:00:00",
        endsAt: "2026-08-03 11:00:00",
        venue: "AKARI House",
        publicUrl: "https://akarihouse.com/events/gathering",
      }),
    );
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe(
      "20260803T100000Z/20260803T110000Z",
    );
    expect(url.searchParams.get("details")).not.toContain("meeting");
  });

  it("enforces requested privacy and participation boundaries in routes", () => {
    const profile = read("app/lib/profile.server.ts");
    const members = read("app/routes/members.tsx");
    const project = read("app/routes/project-detail.tsx");
    const campaign = read("app/routes/campaign-detail.tsx");
    const event = read("app/routes/event-detail.tsx");
    const diligence = read("app/routes/project-diligence.tsx");

    expect(profile).toContain("profile.showLocation === 1");
    expect(members).toContain("pss.show_location");
    expect(project).toContain("isVerifiedInvestor");
    expect(campaign).toContain("profile_reputation_signals");
    expect(campaign).toContain("posting_days_json");
    expect(event).toContain("event_interests");
    expect(event).toContain("Add to Google Calendar");
    expect(diligence).toContain("dataRoomAccessIsCurrent");
  });

  it("keeps the membership application lightweight before human review", () => {
    const register = read("app/routes/register.tsx");
    expect(register).toContain("Start with the essentials");
    expect(register).toContain("full professional profile can be completed");
    expect(register).toContain("minLength={20}");
    expect(register).toContain("maxLength={300}");
    expect(register).toContain("Apply to AKARI");
    expect(register).not.toContain("auth-journey");
  });

  it("imports linked event images through a bounded HTTPS-only pipeline", () => {
    const importer = read("app/lib/event-image.server.ts");
    expect(importer).toContain('url.protocol !== "https:"');
    expect(importer).toContain("MAX_EVENT_IMAGE_BYTES");
    expect(importer).toContain('redirect: "manual"');
    expect(importer).toContain("isPrivateIpv4");
  });

  it("gives every final public onboarding page a title and primary heading", () => {
    for (const route of ["campaigns", "contact", "register"]) {
      const source = read(`app/routes/${route}.tsx`);
      expect(source).toContain("export const meta: Route.MetaFunction");
      expect(source).toContain("{ title:");
    }

    expect(read("app/routes/membership.tsx")).toContain(
      "<MembershipDesk standalone />",
    );
    expect(read("app/components/membership/MembershipDesk.tsx")).toContain(
      'const Heading = standalone ? "h1" : "h2";',
    );
  });
});
