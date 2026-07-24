import { sha256 } from "./security.server";

export const legalPolicyVersions = {
  terms: "2026-07-24",
  privacy: "2026-07-24",
  community_guidelines: "2026-07-24",
} as const;

export type LegalPolicy = keyof typeof legalPolicyVersions;

const legalPolicyActions: Record<
  LegalPolicy,
  "agreement" | "acknowledgement"
> = {
  terms: "agreement",
  privacy: "acknowledgement",
  community_guidelines: "agreement",
};

export async function legalAcceptanceStatements(
  db: D1Database,
  request: Request,
  userId: string,
) {
  const fingerprint = await sha256(
    [
      request.headers.get("CF-Connecting-IP") ?? "unknown",
      request.headers.get("User-Agent") ?? "unknown",
    ].join(":"),
  );
  return (Object.entries(legalPolicyVersions) as [LegalPolicy, string][]).map(
    ([policy, version]) =>
      db
        .prepare(
          `INSERT INTO legal_acceptances
           (id, user_id, policy, action, policy_version, request_fingerprint)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          policy,
          legalPolicyActions[policy],
          version,
          fingerprint,
        ),
  );
}
