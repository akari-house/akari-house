import { requireUser } from "./auth.server";
import {
  effectiveWorkspaceEntitlements,
  workspaceRoleCanManage,
  workspaceRoleCanViewFinance,
  type WorkspaceRole,
} from "./commercial-saas";

export type WorkspaceAccess = {
  workspaceId: string;
  slug: string;
  name: string;
  status: string;
  role: WorkspaceRole;
  supportAccess: boolean;
};

async function isSuperAdmin(db: D1Database, userId: string) {
  return Boolean(
    await db
      .prepare(
        "SELECT 1 FROM admin_users WHERE user_id = ? AND access_level = 'superadmin'",
      )
      .bind(userId)
      .first(),
  );
}

export async function workspaceAccessForUser(
  db: D1Database,
  slug: string,
  userId: string,
): Promise<WorkspaceAccess | null> {
  const row = await db
    .prepare(
      `SELECT w.id AS workspaceId, w.slug, w.name, w.status,
              wm.role, wm.status AS memberStatus
       FROM saas_workspaces w
       LEFT JOIN saas_workspace_members wm
         ON wm.workspace_id = w.id AND wm.user_id = ?
       WHERE w.slug = ? COLLATE NOCASE
       LIMIT 1`,
    )
    .bind(userId, slug)
    .first<{
      workspaceId: string;
      slug: string;
      name: string;
      status: string;
      role: WorkspaceRole | null;
      memberStatus: string | null;
    }>();
  if (!row) return null;
  if (row.role && row.memberStatus === "active")
    return {
      workspaceId: row.workspaceId,
      slug: row.slug,
      name: row.name,
      status: row.status,
      role: row.role,
      supportAccess: false,
    };
  if (await isSuperAdmin(db, userId))
    return {
      workspaceId: row.workspaceId,
      slug: row.slug,
      name: row.name,
      status: row.status,
      role: "admin",
      supportAccess: true,
    };
  return null;
}

export async function requireWorkspaceAccess(
  request: Request,
  db: D1Database,
  slug: string | undefined,
) {
  const user = await requireUser(request, db);
  if (!slug) throw new Response("Workspace not found.", { status: 404 });
  const access = await workspaceAccessForUser(db, slug, user.id);
  if (!access) throw new Response("Workspace not found.", { status: 404 });
  if (["suspended", "closed"].includes(access.status) && !access.supportAccess)
    throw new Response("Workspace access is suspended.", { status: 403 });
  return { user, access };
}

export async function requireWorkspaceManager(
  request: Request,
  db: D1Database,
  slug: string | undefined,
) {
  const result = await requireWorkspaceAccess(request, db, slug);
  if (
    !result.access.supportAccess &&
    !workspaceRoleCanManage(result.access.role)
  )
    throw new Response("Workspace manager access required.", { status: 403 });
  return result;
}

export async function loadWorkspaceEntitlements(
  db: D1Database,
  workspaceId: string,
) {
  const [subscription, overrides] = await Promise.all([
    db
      .prepare(
        `SELECT sp.entitlements_json AS entitlementsJson,
                COALESCE(ws.seat_limit_override, sp.seat_limit) AS seatLimit,
                COALESCE(ws.storage_limit_mb_override, sp.storage_limit_mb) AS storageLimitMb,
                ws.status AS subscriptionStatus, sp.code AS planCode, sp.name AS planName
         FROM saas_workspace_subscriptions ws
         JOIN saas_plans sp ON sp.id = ws.plan_id
         WHERE ws.workspace_id = ?`,
      )
      .bind(workspaceId)
      .first<{
        entitlementsJson: string;
        seatLimit: number;
        storageLimitMb: number;
        subscriptionStatus: string;
        planCode: string;
        planName: string;
      }>(),
    db
      .prepare(
        `SELECT module_key AS moduleKey, enabled
         FROM saas_workspace_module_entitlements WHERE workspace_id = ?`,
      )
      .bind(workspaceId)
      .all<{ moduleKey: string; enabled: number }>(),
  ]);
  return {
    modules: effectiveWorkspaceEntitlements(
      subscription?.entitlementsJson,
      overrides.results,
    ),
    seatLimit: subscription?.seatLimit ?? 0,
    storageLimitMb: subscription?.storageLimitMb ?? 0,
    subscriptionStatus: subscription?.subscriptionStatus ?? "unconfigured",
    planCode: subscription?.planCode ?? "unconfigured",
    planName: subscription?.planName ?? "No plan",
  };
}

export function workspaceCanViewFinance(access: WorkspaceAccess) {
  return access.supportAccess || workspaceRoleCanViewFinance(access.role);
}
