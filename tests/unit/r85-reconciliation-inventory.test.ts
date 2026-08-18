import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/reconciliation/r85-inventory.mjs";

function d1Result(rows: Record<string, unknown>[]) {
  return { success: true, errors: [], result: [{ success: true, results: rows }] };
}

type SanitizedStatus = {
  bridgeMode: string;
  mappingWrites: number;
  backupLocation: string;
  houseMetrics?: unknown;
  crmMetrics?: unknown;
  crmTenantId?: unknown;
};

describe("R85 reconciliation inventory checkpoint", () => {
  it("selects a tenant only when the CRM has exactly one tenant", () => {
    const dir = mkdtempSync(join(tmpdir(), "akari-r85-"));
    const input = join(dir, "tenants.json");
    const output = join(dir, "selection.json");

    writeFileSync(input, JSON.stringify(d1Result([{ id: "tenant-one" }])));
    execFileSync(process.execPath, [script, "select-tenant", input, output]);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      status: "unique",
      tenantId: "tenant-one",
    });

    writeFileSync(
      input,
      JSON.stringify(d1Result([{ id: "tenant-one" }, { id: "tenant-two" }])),
    );
    execFileSync(process.execPath, [script, "select-tenant", input, output]);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      status: "ambiguous",
      tenantId: null,
      candidateCount: 2,
    });
  });

  it("stores counts only in the private audit SQL and emits a sanitized status", () => {
    const dir = mkdtempSync(join(tmpdir(), "akari-r85-"));
    const house = join(dir, "house.json");
    const crm = join(dir, "crm.json");
    const tenant = join(dir, "tenant.json");
    const backups = join(dir, "backups.json");
    const audit = join(dir, "audit.sql");
    const status = join(dir, "status.json");

    writeFileSync(
      house,
      JSON.stringify(
        d1Result([
          { metric: "legacy_current_signed_ndas", value: 3 },
          { metric: "legacy_current_ndas_resolvable_to_house_user", value: 2 },
        ]),
      ),
    );
    writeFileSync(
      crm,
      JSON.stringify(
        d1Result([
          { metric: "crm_current_ndas", value: 4 },
          { metric: "house_agreement_links", value: 0 },
        ]),
      ),
    );
    writeFileSync(tenant, JSON.stringify({ status: "unique", tenantId: "crm-t1" }));
    writeFileSync(
      backups,
      JSON.stringify({
        createdAt: "2026-08-19T00:00:00Z",
        house: { encrypted: true, key: "private/house.enc" },
        crm: { encrypted: true, key: "private/crm.enc" },
      }),
    );

    execFileSync(process.execPath, [
      script,
      "finalize",
      house,
      crm,
      tenant,
      backups,
      audit,
      status,
    ]);

    const auditSql = readFileSync(audit, "utf8");
    expect(auditSql).toContain("r85.crm_reconciliation_inventory");
    expect(auditSql).toContain('"bridgeMode":"legacy"');
    expect(auditSql).toContain('"mappingWrites":0');
    expect(auditSql).toContain('"legacy_current_signed_ndas":3');
    expect(auditSql).toContain('"crm_current_ndas":4');

    const publicStatus = JSON.parse(
      readFileSync(status, "utf8"),
    ) as SanitizedStatus;
    expect(publicStatus.bridgeMode).toBe("legacy");
    expect(publicStatus.mappingWrites).toBe(0);
    expect(publicStatus.backupLocation).toBe("encrypted-r2");
    expect(publicStatus).not.toHaveProperty("houseMetrics");
    expect(publicStatus).not.toHaveProperty("crmMetrics");
    expect(publicStatus).not.toHaveProperty("crmTenantId");
  });

  it("keeps the production workflow encrypted, count-only and mapping-free", () => {
    const workflow = readFileSync(
      ".github/workflows/r85-reconciliation-inventory.yml",
      "utf8",
    );
    expect(workflow).toContain("backup-crypto.mjs encrypt");
    expect(workflow).toContain('r2 object put "akari-house-media/${house_key}"');
    expect(workflow).toContain('r2 object put "akari-house-media/${crm_key}"');
    expect(workflow).toContain("docs/r84-house-legacy-crm-inventory.sql");
    expect(workflow).toContain(
      "CRMAKARI/bab2777a984b0dfdd95a3de84de695e206469661/docs/house-crm-reconciliation-inventory.sql",
    );
    expect(workflow).toContain('SELECT id FROM tenants ORDER BY created_at, id;');
    expect(workflow).toContain("No mapping writes were made");
    expect(workflow).not.toContain("INSERT INTO external_entity_links");
    expect(workflow).not.toContain("UPDATE external_entity_links");
    expect(workflow).not.toContain("/house-bridge");
    expect(workflow).not.toContain("production-d1-backup");
  });
});
