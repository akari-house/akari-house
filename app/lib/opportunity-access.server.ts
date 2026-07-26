import type { SessionUser } from "./domain";

export const investorProfileStatuses = [
  "claimed",
  "profile_complete",
  "verification_pending",
  "verified",
  "restricted",
  "rejected",
] as const;

export type InvestorProfileStatus = (typeof investorProfileStatuses)[number];

export type OpportunityAccessState =
  | "public_preview"
  | "verification_required"
  | "request_required"
  | "requested"
  | "approved"
  | "declined"
  | "revoked"
  | "expired"
  | "restricted";

type InvestorEligibilityRow = {
  profileStatus: InvestorProfileStatus;
  roleStatus: string;
};

export type ListingAccessSnapshot = {
  accessMode: "verified_investors" | "approved_only";
  listingStatus: string;
  requestStatus: string | null;
  expiresAt: string | null;
};

export function resolveOpportunityListingAccess(
  row: ListingAccessSnapshot | null,
  now = Date.now(),
): OpportunityAccessState {
  if (!row || row.listingStatus !== "published") return "restricted";
  if (row.accessMode === "verified_investors") return "approved";
  if (!row.requestStatus) return "request_required";
  if (row.requestStatus === "approved") {
    if (row.expiresAt && Date.parse(row.expiresAt) <= now) return "expired";
    return "approved";
  }
  if (row.requestStatus === "pending") return "requested";
  if (row.requestStatus === "declined") return "declined";
  if (row.requestStatus === "revoked") return "revoked";
  if (row.requestStatus === "expired") return "expired";
  return "request_required";
}

export async function investorEligibility(
  db: D1Database,
  userId: string,
): Promise<InvestorEligibilityRow | null> {
  return db
    .prepare(
      `SELECT ip.status AS profileStatus, rv.status AS roleStatus
       FROM investor_profiles ip
       JOIN role_verifications rv
         ON rv.user_id = ip.user_id AND rv.role = 'investor'
       JOIN users u ON u.id = ip.user_id
       JOIN membership_applications ma ON ma.user_id = ip.user_id
       WHERE ip.user_id = ?
         AND u.status = 'active'
         AND ma.status = 'approved'`,
    )
    .bind(userId)
    .first<InvestorEligibilityRow>();
}

export async function isVerifiedInvestor(
  db: D1Database,
  user: SessionUser | null,
) {
  if (!user || user.accessTier !== "member" || !user.roles.includes("investor"))
    return false;
  const eligibility = await investorEligibility(db, user.id);
  return (
    eligibility?.profileStatus === "verified" &&
    eligibility.roleStatus === "verified"
  );
}

export async function opportunityAccessState(
  db: D1Database,
  projectId: string,
  user: SessionUser | null,
): Promise<OpportunityAccessState> {
  if (!user) return "public_preview";
  if (user.accessTier !== "member" || !user.roles.includes("investor"))
    return "restricted";
  if (!(await isVerifiedInvestor(db, user))) return "verification_required";

  const row = await db
    .prepare(
      `SELECT ol.access_mode AS accessMode, ol.status AS listingStatus,
              drr.status AS requestStatus, drr.expires_at AS expiresAt
       FROM opportunity_listings ol
       LEFT JOIN data_room_requests drr
         ON drr.project_id = ol.project_id
        AND drr.investor_user_id = ?
       WHERE ol.project_id = ?`,
    )
    .bind(user.id, projectId)
    .first<ListingAccessSnapshot>();

  return resolveOpportunityListingAccess(row);
}

export async function requireOpportunityAccess(
  db: D1Database,
  projectId: string,
  user: SessionUser | null,
) {
  const state = await opportunityAccessState(db, projectId, user);
  if (state !== "approved")
    throw new Response("Opportunity access not available.", { status: 404 });
  return state;
}

export async function recordOpportunityAudit(
  db: D1Database,
  actorUserId: string | null,
  action: string,
  projectId: string,
  metadata: Record<string, unknown> = {},
) {
  await db
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, ?, 'opportunity', ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorUserId,
      action,
      projectId,
      JSON.stringify(metadata),
    )
    .run();
}
