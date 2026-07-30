import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const applicationsSource = readFileSync(
  "app/routes/admin-applications.tsx",
  "utf8",
);
const registerSource = readFileSync("app/routes/register.tsx", "utf8");

describe("membership profile visibility defaults", () => {
  it("keeps applicants private during review", () => {
    expect(registerSource).toContain(
      "INSERT INTO profiles (user_id, display_name, visibility) VALUES (?, ?, 'private')",
    );
    expect(registerSource).toContain(
      "INSERT INTO profile_visibility (user_id, visibility) VALUES (?, 'private')",
    );
  });

  it("makes newly approved profiles public by default", () => {
    expect(
      applicationsSource.match(/WHEN visibility = 'private' THEN 'public'/g),
    ).toHaveLength(2);
    expect(applicationsSource).not.toContain(
      "WHEN visibility = 'private' THEN 'connections'",
    );
  });
});
