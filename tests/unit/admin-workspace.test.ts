import { describe, expect, it } from "vitest";
import {
  crmProductBoundary,
  visibleAdminWorkspaceItems,
  type AdminWorkspaceAccess,
} from "../../app/lib/admin-workspace";

const visibleKeys = (access: AdminWorkspaceAccess) =>
  visibleAdminWorkspaceItems(access).map((item) => item.key);

describe("admin workspace permissions", () => {
  it("gives superadmins the complete House workspace without CRM-only modules", () => {
    const keys = visibleKeys({ accessLevel: "superadmin", scopes: [] });
    expect(keys).toContain("operations");
    expect(keys).toContain("team");
    expect(keys).toContain("verification");
    expect(keys).toContain("moderation");
    expect(keys).not.toContain("agreements");
    expect(keys).not.toContain("relationships");
    expect(keys).not.toContain("operating-rhythm");
    expect(keys).not.toContain("finance");
    expect(keys).not.toContain("saas-workspaces");
    expect(crmProductBoundary.url).toBe("https://crm.akarihouse.com");
  });

  it("keeps moderation and verification as separate scopes", () => {
    const moderator = visibleKeys({
      accessLevel: "admin",
      scopes: ["moderation"],
    });
    expect(moderator).toContain("moderation");
    expect(moderator).toContain("contact");
    expect(moderator).not.toContain("verification");
    expect(moderator).not.toContain("team");

    const verifier = visibleKeys({
      accessLevel: "admin",
      scopes: ["verification"],
    });
    expect(verifier).toContain("verification");
    expect(verifier).not.toContain("moderation");
  });
});
