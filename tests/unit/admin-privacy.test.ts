import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin privacy surfaces", () => {
  it("does not display administrator account emails", () => {
    const adminTeam = source("app/routes/admin-team.tsx");
    expect(adminTeam).not.toContain("admin.email");
    expect(adminTeam).not.toContain("u.email, p.display_name");
  });

  it("keeps account email out of the browser session model", () => {
    const auth = source("app/lib/auth.server.ts");
    const domain = source("app/lib/domain.ts");
    const membership = source("app/lib/membership.server.ts");
    expect(auth).not.toContain("SELECT u.id, u.email, u.username");
    expect(domain).not.toMatch(/interface SessionUser \{[\s\S]*email:/);
    expect(membership).not.toContain("u.email");
  });

  it("does not display membership applicant account emails", () => {
    const applications = source("app/routes/admin-applications.tsx");
    expect(applications).not.toContain("application.email}");
    expect(applications).not.toContain("ma.created_at AS createdAt, u.email");
  });

  it("does not include account email in IIO exports", () => {
    const exportRoute = source("app/routes/admin-iio-export.ts");
    expect(exportRoute).not.toContain('"Email"');
    expect(exportRoute).not.toContain("u.email");
    expect(exportRoute).not.toContain("item.email");
  });
});
