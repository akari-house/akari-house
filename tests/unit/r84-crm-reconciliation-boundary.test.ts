import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("R84 House / CRM reconciliation boundary", () => {
  it("registers the diligence wrapper instead of the legacy NDA route directly", () => {
    const routes = read("app/routes.ts");
    expect(routes).toContain(
      'route("projects/:slug/diligence", "routes/project-diligence-bridge.tsx")',
    );
    expect(routes).not.toContain(
      'route("projects/:slug/diligence", "routes/project-diligence-completion.tsx")',
    );
  });

  it("uses one central NDA bridge for loader state and diligence Q&A authorization", () => {
    const route = read("app/routes/project-diligence-bridge.tsx");
    expect(route).toContain('from "~/lib/crm-nda-bridge.server"');
    expect(route.match(/ndaBridgeDecision\(/g)?.length).toBe(2);
    expect(route).not.toContain("agreement_records");
    expect(route).not.toContain("counterparty_email");
    expect(route).not.toContain("legacyDiligenceLoader");
  });

  it("keeps the deploy-safe cutover default on legacy authority", () => {
    const wrangler = read("wrangler.jsonc");
    const bridge = read("app/lib/crm-nda-bridge.server.ts");
    expect(wrangler).toContain('"CRM_NDA_BRIDGE_MODE": "legacy"');
    expect(wrangler).toContain(
      '"CRM_API_URL": "https://crmakari.pages.dev/api/v1"',
    );
    expect(bridge).toContain('env.CRM_NDA_BRIDGE_MODE || "legacy"');
    expect(bridge).toContain(
      'return value === "crm" || value === "shadow" ? value : "legacy";',
    );
    expect(bridge).toContain('mode === "crm"');
  });

  it("makes CRM authority fail closed while shadow mode preserves legacy authorization", () => {
    const bridge = read("app/lib/crm-nda-bridge.server.ts");
    expect(bridge).toContain("signed: crmStatus?.signed ?? false");
    expect(bridge).toContain("signed: legacySigned");
    expect(bridge).toContain('source: "HOUSE_LEGACY_SHADOW"');
  });

  it("does not require a CRM secret before shadow/cutover is deliberately enabled", () => {
    const wrangler = read("wrangler.jsonc");
    expect(wrangler).not.toMatch(/"required"\s*:\s*\[[^\]]*"CRM_API_KEY"/s);
    expect(wrangler).not.toContain("ak_live_");
  });

  it("preserves legacy CRM-era House tables until the destructive cleanup release", () => {
    const agreements = read("migrations/0116_agreement_tracking.sql");
    const relationships = read("migrations/0119_relationship_intelligence.sql");
    const commercial = read("migrations/0121_commercial_saas_completion.sql");
    expect(agreements).toContain("CREATE TABLE agreement_records");
    expect(relationships).toContain("CREATE TABLE relationship_records");
    expect(commercial).toContain("CREATE TABLE saas_workspaces");
  });
});
