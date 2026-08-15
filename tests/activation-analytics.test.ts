import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completedActivationMilestones } from "../app/lib/activation-analytics.server";
import type { MemberActivationSnapshot } from "../app/lib/activation-next-actions";

const baseMember: MemberActivationSnapshot = {
  accessTier: "member",
  roles: [],
  profilePercent: 0,
  profileMissing: ["profile"],
  founderProjectCount: 0,
  founderDraftProjectCount: 0,
  founderPublishedProjectCount: 0,
  founderPendingClaimCount: 0,
  founderOutcomeActivationCount: 0,
  xProfileUrl: "",
  xFollowerCount: null,
  xScore: null,
  sorsaScore: null,
  creatorApplicationCount: 0,
  creatorAcceptedCampaignCount: 0,
  investorProfileStatus: null,
  investorPreferencesComplete: false,
  investorInterestCount: 0,
  investorProgressedCount: 0,
  unreadNotifications: 0,
  pendingConnections: 0,
};

describe("R76G activation milestones", () => {
  it("records completed profile, Founder and Investor states", () => {
    const milestones = completedActivationMilestones({
      ...baseMember,
      roles: ["founder", "investor"],
      profilePercent: 100,
      profileMissing: [],
      founderProjectCount: 1,
      investorPreferencesComplete: true,
    });

    expect(milestones.map((item) => item.key)).toEqual([
      "profile-complete",
      "founder-first-project",
      "investor-preferences-complete",
    ]);
  });

  it("treats zero Creator followers as complete data rather than a threshold failure", () => {
    const milestones = completedActivationMilestones({
      ...baseMember,
      roles: ["creator"],
      xProfileUrl: "https://x.com/example",
      xFollowerCount: 0,
      xScore: 1,
      sorsaScore: 0,
    });

    expect(milestones).toContainEqual({
      key: "creator-campaign-ready",
      role: "creator",
    });
  });

  it("does not mark a Creator ready when follower data is missing", () => {
    const milestones = completedActivationMilestones({
      ...baseMember,
      roles: ["creator"],
      xProfileUrl: "https://x.com/example",
      xFollowerCount: null,
      xScore: 500,
      sorsaScore: 10,
    });

    expect(
      milestones.some((item) => item.key === "creator-campaign-ready"),
    ).toBe(false);
  });
});

describe("R76G/R76H privacy and route security", () => {
  it("uses an additive privacy-minimal activation schema", () => {
    const migration = readFileSync(
      "migrations/0113_activation_analytics.sql",
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE activation_action_events");
    expect(migration).toContain("CREATE TABLE activation_milestones");
    expect(migration).toContain("event_type IN ('shown', 'clicked')");
    expect(migration).not.toContain("email");
    expect(migration).not.toContain("bio");
    expect(migration).not.toContain("location");
  });

  it("keeps the R76H SLA schema additive and operational only", () => {
    const migration = readFileSync(
      "migrations/0114_outcome_intelligence_sla.sql",
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE review_sla_policies");
    expect(migration).toContain("CREATE TABLE review_queue_state");
    expect(migration).toContain("paused_seconds");
    expect(migration).not.toContain("ALTER TABLE membership_applications");
    expect(migration).not.toContain("ALTER TABLE role_verifications");
    expect(migration).not.toContain("email");
    expect(migration).not.toContain("bio");
    expect(migration).not.toContain("location");
  });

  it("requires a signed-in same-origin request for activation clicks", () => {
    const endpoint = readFileSync("app/routes/activation-events.ts", "utf8");

    expect(endpoint).toContain("assertSameOrigin(request)");
    expect(endpoint).toContain("requireUser(request, db)");
    expect(endpoint).toContain("allowedActionKeys");
    expect(endpoint).toContain('"Cache-Control": "private, no-store"');
    expect(endpoint).not.toContain("metadata_json");
  });

  it("keeps analytics and the unified review inbox Superadmin-only", () => {
    const analytics = readFileSync("app/routes/admin-activation.tsx", "utf8");
    const inbox = readFileSync("app/routes/admin-review-inbox.tsx", "utf8");
    const routes = readFileSync("app/routes.ts", "utf8");

    expect(analytics).toContain("requireSuperAdmin(request, db)");
    expect(inbox).toContain("requireSuperAdmin(request, db)");
    expect(inbox).toContain("assertSameOrigin(request)");
    expect(routes).toContain(
      'route("api/activation/events", "routes/activation-events.ts")',
    );
    expect(routes).toContain(
      'route("admin/reviews", "routes/admin-review-inbox.tsx")',
    );
    expect(routes).toContain(
      'route("admin/activation", "routes/admin-activation.tsx")',
    );
  });

  it("triages governed review sources without duplicating decision writes", () => {
    const inbox = readFileSync("app/routes/admin-review-inbox.tsx", "utf8");

    expect(inbox).toContain("membership_applications");
    expect(inbox).toContain("role_verifications");
    expect(inbox).toContain("project_relationships");
    expect(inbox).toContain("moderation_reports");
    expect(inbox).toContain("review_queue_state");
    expect(inbox).toContain("review_sla_policies");
    expect(inbox).not.toContain("UPDATE membership_applications");
    expect(inbox).not.toContain("UPDATE role_verifications");
    expect(inbox).not.toContain("UPDATE project_relationships");
    expect(inbox).not.toContain("UPDATE moderation_reports");
  });
});
