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
         ON drr.id = (
           SELECT request.id
           FROM data_room_requests request
           WHERE request.project_id = ol.project_id
             AND request.investor_user_id = ?
           ORDER BY request.created_at DESC, request.id DESC
           LIMIT 1
         )
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

export async function recordOpportunityView(
  db: D1Database,
  userId: string,
  projectId: string,
  dedupeMinutes = 30,
) {
  const current = await db
    .prepare(
      `SELECT last_viewed_at AS lastViewedAt
       FROM opportunity_user_states
       WHERE project_id = ? AND user_id = ?`,
    )
    .bind(projectId, userId)
    .first<{ lastViewedAt: string | null }>();
  const lastViewedAt = current?.lastViewedAt
    ? Date.parse(current.lastViewedAt)
    : Number.NaN;
  const shouldAudit =
    !Number.isFinite(lastViewedAt) ||
    Date.now() - lastViewedAt >= dedupeMinutes * 60 * 1000;

  await db
    .prepare(
      `INSERT INTO opportunity_user_states
         (project_id, user_id, last_viewed_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         last_viewed_at = datetime('now'), updated_at = datetime('now')`,
    )
    .bind(projectId, userId)
    .run();

  if (shouldAudit)
    await recordOpportunityAudit(db, userId, "opportunity.viewed", projectId);
}
