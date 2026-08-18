import { afterEach, describe, expect, it, vi } from "vitest";
import { ndaBridgeDecision, readCrmNdaStatus } from "~/lib/crm-nda-bridge.server";

class FakeDb {
  signed: boolean;
  calls: Array<{ sql: string; bindings: unknown[] }> = [];

  constructor(signed: boolean) {
    this.signed = signed;
  }

  prepare(sql: string) {
    return {
      bind: (...bindings: unknown[]) => {
        this.calls.push({ sql, bindings });
        return {
          first: () => Promise.resolve(this.signed ? { ok: 1 } : null),
        };
      },
    };
  }
}

const env = (values: Record<string, unknown> = {}) =>
  values as unknown as CloudflareEnvironment;

const crmResponse = (signed: boolean, reason: string) =>
  new Response(
    JSON.stringify({
      signed,
      authoritative: true,
      source: "CRM_BY_AKARI",
      reason,
      checkedAt: "2026-08-18T20:00:00.000Z",
      provenance: signed
        ? {
            agreementId: "agr_nda_a",
            status: "ACTIVE",
            signedAt: "2026-08-01T00:00:00.000Z",
            activatedAt: "2026-08-02T00:00:00.000Z",
            expiresAt: "2027-08-01T00:00:00.000Z",
          }
        : null,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R84 CRM NDA bridge", () => {
  it("defaults to legacy House NDA authority and does not call CRM", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const db = new FakeDb(true);

    const decision = await ndaBridgeDecision(
      env(),
      db as unknown as D1Database,
      "project_a",
      "investor_a",
    );

    expect(decision).toMatchObject({
      signed: true,
      mode: "legacy",
      source: "HOUSE_LEGACY",
      mismatch: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.calls[0]?.bindings).toEqual(["project_a", "investor_a"]);
  });

  it("shadow mode compares CRM but keeps legacy authorization", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      crmResponse(false, "NO_ACTIVE_NDA"),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = new FakeDb(true);

    const decision = await ndaBridgeDecision(
      env({
        CRM_NDA_BRIDGE_MODE: "shadow",
        CRM_API_URL: "https://crmakari.pages.dev/api/v1",
        CRM_API_KEY: "ak_live_test",
      }),
      db as unknown as D1Database,
      "project_a",
      "investor_a",
    );

    expect(decision.signed).toBe(true);
    expect(decision.mode).toBe("shadow");
    expect(decision.source).toBe("HOUSE_LEGACY_SHADOW");
    expect(decision.crmStatus?.signed).toBe(false);
    expect(decision.mismatch).toBe(true);
    expect(warning).toHaveBeenCalledOnce();
  });

  it("CRM mode fails closed when CRM is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = new FakeDb(true);

    const decision = await ndaBridgeDecision(
      env({
        CRM_NDA_BRIDGE_MODE: "crm",
        CRM_API_URL: "https://crmakari.pages.dev/api/v1",
        CRM_API_KEY: "ak_live_test",
      }),
      db as unknown as D1Database,
      "project_a",
      "investor_a",
    );

    expect(decision).toMatchObject({
      signed: false,
      mode: "crm",
      source: "CRM_BY_AKARI",
      crmStatus: null,
    });
    expect(db.calls).toHaveLength(0);
  });

  it("accepts only a narrow authoritative CRM payload", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(crmResponse(true, "SIGNED_NDA"));

    const status = await readCrmNdaStatus(
      env({
        CRM_API_URL: "https://crmakari.pages.dev/api/v1",
        CRM_API_KEY: "ak_live_test",
      }),
      "project_a",
      "investor_a",
    );

    expect(status).toEqual({
      signed: true,
      authoritative: true,
      source: "CRM_BY_AKARI",
      reason: "SIGNED_NDA",
      checkedAt: "2026-08-18T20:00:00.000Z",
      provenance: {
        agreementId: "agr_nda_a",
        status: "ACTIVE",
        signedAt: "2026-08-01T00:00:00.000Z",
        activatedAt: "2026-08-02T00:00:00.000Z",
        expiresAt: "2027-08-01T00:00:00.000Z",
      },
    });
    const request = fetchSpy.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(URL);
    if (!(request instanceof URL)) throw new Error("CRM bridge must fetch a URL");
    expect(request.searchParams.get("houseProjectId")).toBe("project_a");
    expect(request.searchParams.get("houseMemberId")).toBe("investor_a");
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer ak_live_test",
    );
  });

  it("does not call a non-HTTPS CRM endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const status = await readCrmNdaStatus(
      env({
        CRM_API_URL: "http://crm.invalid/api/v1",
        CRM_API_KEY: "ak_live_test",
      }),
      "project_a",
      "investor_a",
    );
    expect(status).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
