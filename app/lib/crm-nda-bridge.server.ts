export type CrmNdaBridgeMode = "legacy" | "shadow" | "crm";

type CrmBridgeEnvironment = CloudflareEnvironment & {
  CRM_API_URL?: string;
  CRM_API_KEY?: string;
  CRM_NDA_BRIDGE_MODE?: string;
};

type CrmNdaPayload = {
  signed?: unknown;
  authoritative?: unknown;
  source?: unknown;
  reason?: unknown;
  checkedAt?: unknown;
  provenance?: {
    agreementId?: unknown;
    status?: unknown;
    signedAt?: unknown;
    activatedAt?: unknown;
    expiresAt?: unknown;
  } | null;
};

export type CrmNdaStatus = {
  signed: boolean;
  authoritative: boolean;
  source: "CRM_BY_AKARI";
  reason: "SIGNED_NDA" | "NO_ACTIVE_NDA" | "PROJECT_NOT_LINKED";
  checkedAt: string;
  provenance: {
    agreementId: string;
    status: string;
    signedAt: string | null;
    activatedAt: string | null;
    expiresAt: string | null;
  } | null;
};

export type NdaBridgeDecision = {
  signed: boolean;
  mode: CrmNdaBridgeMode;
  source: "HOUSE_LEGACY" | "CRM_BY_AKARI" | "HOUSE_LEGACY_SHADOW";
  crmStatus: CrmNdaStatus | null;
  mismatch: boolean;
};

function bridgeMode(env: CrmBridgeEnvironment): CrmNdaBridgeMode {
  const value = String(env.CRM_NDA_BRIDGE_MODE || "legacy")
    .trim()
    .toLowerCase();
  return value === "crm" || value === "shadow" ? value : "legacy";
}

function text(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max = 300) {
  const valueText = text(value, max);
  return valueText || null;
}

function parseCrmStatus(payload: CrmNdaPayload): CrmNdaStatus | null {
  if (payload.authoritative !== true || typeof payload.signed !== "boolean")
    return null;
  const source = text(payload.source, 40);
  const reason = text(payload.reason, 40);
  if (source !== "CRM_BY_AKARI") return null;
  if (
    reason !== "SIGNED_NDA" &&
    reason !== "NO_ACTIVE_NDA" &&
    reason !== "PROJECT_NOT_LINKED"
  )
    return null;

  const checkedAt = text(payload.checkedAt, 80) || new Date().toISOString();
  const provenance = payload.provenance;
  const agreementId = provenance ? text(provenance.agreementId, 160) : "";

  return {
    signed: payload.signed,
    authoritative: true,
    source: "CRM_BY_AKARI",
    reason,
    checkedAt,
    provenance:
      payload.signed && agreementId
        ? {
            agreementId,
            status: text(provenance?.status, 40),
            signedAt: nullableText(provenance?.signedAt, 80),
            activatedAt: nullableText(provenance?.activatedAt, 80),
            expiresAt: nullableText(provenance?.expiresAt, 80),
          }
        : null,
  };
}

async function legacySignedNda(
  db: D1Database,
  projectId: string,
  investorUserId: string,
) {
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM agreement_records ar
       JOIN users u
         ON lower(trim(u.email)) = lower(trim(ar.counterparty_email))
       WHERE ar.project_id = ? AND u.id = ?
         AND ar.agreement_type = 'nda' AND ar.status = 'signed'
         AND (ar.expires_at IS NULL OR ar.expires_at > datetime('now'))
       LIMIT 1`,
    )
    .bind(projectId, investorUserId)
    .first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function readCrmNdaStatus(
  env: CloudflareEnvironment,
  houseProjectId: string,
  houseMemberId: string,
): Promise<CrmNdaStatus | null> {
  const bridgeEnv = env as CrmBridgeEnvironment;
  const baseUrl = String(bridgeEnv.CRM_API_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(bridgeEnv.CRM_API_KEY || "").trim();
  if (!baseUrl || !apiKey) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(`${baseUrl}/house-nda-status`);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:") return null;
  endpoint.searchParams.set("houseProjectId", houseProjectId);
  endpoint.searchParams.set("houseMemberId", houseMemberId);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("CRM NDA bridge returned a non-success response.", {
        status: response.status,
        projectId: houseProjectId,
        memberId: houseMemberId,
      });
      return null;
    }
    return parseCrmStatus((await response.json()) as CrmNdaPayload);
  } catch (error) {
    console.error("CRM NDA bridge request failed.", {
      projectId: houseProjectId,
      memberId: houseMemberId,
      error: error instanceof Error ? error.message : "Unknown bridge error",
    });
    return null;
  }
}

export async function ndaBridgeDecision(
  env: CloudflareEnvironment,
  db: D1Database,
  projectId: string,
  investorUserId: string,
): Promise<NdaBridgeDecision> {
  const mode = bridgeMode(env as CrmBridgeEnvironment);

  if (mode === "legacy") {
    const signed = await legacySignedNda(db, projectId, investorUserId);
    return {
      signed,
      mode,
      source: "HOUSE_LEGACY",
      crmStatus: null,
      mismatch: false,
    };
  }

  const crmStatusPromise = readCrmNdaStatus(env, projectId, investorUserId);

  if (mode === "crm") {
    const crmStatus = await crmStatusPromise;
    return {
      signed: crmStatus?.signed ?? false,
      mode,
      source: "CRM_BY_AKARI",
      crmStatus,
      mismatch: false,
    };
  }

  const [legacySigned, crmStatus] = await Promise.all([
    legacySignedNda(db, projectId, investorUserId),
    crmStatusPromise,
  ]);
  const mismatch = crmStatus !== null && crmStatus.signed !== legacySigned;
  if (mismatch) {
    console.warn("CRM NDA shadow comparison mismatch.", {
      projectId,
      memberId: investorUserId,
      legacySigned,
      crmSigned: crmStatus?.signed,
      crmReason: crmStatus?.reason,
    });
  }

  return {
    signed: legacySigned,
    mode,
    source: "HOUSE_LEGACY_SHADOW",
    crmStatus,
    mismatch,
  };
}

export async function signedNdaForInvestor(
  env: CloudflareEnvironment,
  db: D1Database,
  projectId: string,
  investorUserId: string,
) {
  return (await ndaBridgeDecision(env, db, projectId, investorUserId)).signed;
}
