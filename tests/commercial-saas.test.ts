import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  effectiveWorkspaceEntitlements,
  invoiceCollectionState,
  isInvoiceOverdue,
  normalizeCurrency,
  normalizeWorkspaceSlug,
  outstandingInvoiceCents,
  sumByCurrency,
  workspaceRoleCanManage,
  workspaceRoleCanViewFinance,
} from "../app/lib/commercial-saas";

describe("R75 commercial and SaaS completion", () => {
  it("normalizes workspace slugs and currencies deterministically", () => {
    expect(normalizeWorkspaceSlug(" Coral App / Growth ")).toBe(
      "coral-app-growth",
    );
    expect(normalizeWorkspaceSlug("!")).toBeNull();
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("$")).toBeNull();
  });

  it("applies plan modules first and explicit workspace overrides second", () => {
    const effective = effectiveWorkspaceEntitlements(
      JSON.stringify({ crm: true, finance: false, reporting: true }),
      [
        { moduleKey: "finance", enabled: 1 },
        { moduleKey: "crm", enabled: 0 },
      ],
    );
    expect(effective.crm).toBe(false);
    expect(effective.finance).toBe(true);
    expect(effective.reporting).toBe(true);
    expect(effective.campaigns).toBe(false);
  });

  it("keeps workspace management and finance permissions explicit", () => {
    expect(workspaceRoleCanManage("owner")).toBe(true);
    expect(workspaceRoleCanManage("admin")).toBe(true);
    expect(workspaceRoleCanManage("finance")).toBe(false);
    expect(workspaceRoleCanViewFinance("finance")).toBe(true);
    expect(workspaceRoleCanViewFinance("member")).toBe(false);
  });

  it("derives invoice collection state from cleared net cash", () => {
    expect(invoiceCollectionState("issued", 100_00, 0)).toBe("issued");
    expect(invoiceCollectionState("issued", 100_00, 25_00)).toBe(
      "partially_paid",
    );
    expect(invoiceCollectionState("partially_paid", 100_00, 100_00)).toBe(
      "paid",
    );
    expect(invoiceCollectionState("void", 100_00, 100_00)).toBe("void");
    expect(outstandingInvoiceCents(100_00, 125_00)).toBe(0);
  });

  it("treats overdue invoices as a time condition, not a mutable status", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(isInvoiceOverdue("issued", "2026-08-16", now)).toBe(true);
    expect(isInvoiceOverdue("partially_paid", "2026-08-18", now)).toBe(false);
    expect(isInvoiceOverdue("paid", "2026-08-16", now)).toBe(false);
  });

  it("never combines currencies into one synthetic total", () => {
    expect(
      sumByCurrency([
        { currency: "USD", amountCents: 100_00 },
        { currency: "usd", amountCents: 25_00 },
        { currency: "EUR", amountCents: 40_00 },
      ]),
    ).toEqual({ USD: 125_00, EUR: 40_00 });
  });

  it("preserves the historical House schema for reconciliation", () => {
    const schema = readFileSync(
      "migrations/0121_commercial_saas_completion.sql",
      "utf8",
    );
    const extension = readFileSync(
      "migrations/0122_operating_rhythm_commercial_extension.sql",
      "utf8",
    );
    expect(schema).toContain("CREATE TABLE saas_workspaces");
    expect(schema).toContain("CREATE TABLE saas_workspace_members");
    expect(schema).toContain("CREATE TABLE saas_workspace_subscriptions");
    expect(schema).toContain("CREATE TABLE commercial_invoices");
    expect(schema).toContain("CREATE TABLE commercial_payments");
    expect(schema).toContain("CREATE TABLE commercial_cost_entries");
    expect(extension).toContain("INSERT INTO attention_item_states_r75");
    expect(extension).toContain("FROM attention_item_states;");
    expect(extension).toContain("INSERT INTO operating_report_runs_r75");
    expect(extension).toContain("FROM operating_report_runs;");
  });

  it("does not expose the legacy finance or SaaS workspace UI in House", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    expect(routes).not.toContain('route("admin/finance"');
    expect(routes).not.toContain('route("admin/workspaces"');
    expect(routes).not.toContain('route("workspaces/:slug"');
    expect(routes).not.toContain('route("workspace-invitations/accept"');
  });
});
