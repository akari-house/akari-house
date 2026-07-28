import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("member discovery connection flow", () => {
  it("discovers connection-gated members without exposing their protected fields", () => {
    const members = read("app/routes/members.tsx");
    expect(members).toContain("IN ('members', 'connections')");
    expect(members).toContain("profileAccessible");
    expect(members).toContain(
      "Profile details open after a mutual connection.",
    );
    expect(members).not.toContain("await getVisibleProfile");
  });

  it("uses connection-gated visibility when an applicant becomes a member", () => {
    const approval = read("app/routes/admin-applications.tsx");
    const migration = read("migrations/0107_member_directory_discovery.sql");
    expect(approval).toContain(
      "WHEN visibility = 'private' THEN 'connections'",
    );
    expect(migration).toContain("SET visibility = 'connections'");
    expect(migration).toContain("closure.status = 'cooling_off'");
  });

  it("renders linked social profiles on visible member profiles", () => {
    const profile = read("app/routes/profile.tsx");
    expect(profile).toContain("loadSocialAccounts");
    expect(profile).toContain('aria-label="Social profiles"');
    expect(profile).toContain("member-profile-socials");
  });

  it("routes pending connection requests to the acceptance screen", () => {
    const network = read("app/lib/network.server.ts");
    const connections = read("app/routes/connections.tsx");
    expect(network).toContain('"/connections"');
    expect(connections).toContain(
      "Profile details open after the request is accepted.",
    );
  });
});
