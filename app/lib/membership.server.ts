import { redirect } from "react-router";
import { getOptionalUser, requireUser } from "./auth.server";

export type MembershipStatus =
  "pending_email" | "pending_review" | "approved" | "declined" | "waitlisted";

export async function membershipStatusForUser(db: D1Database, userId: string) {
  return db
    .prepare(
      `SELECT ma.id, ma.status, ma.created_at AS createdAt
       FROM membership_applications ma
       WHERE ma.user_id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      status: MembershipStatus;
      createdAt: string;
    }>();
}

export async function requireAdmin(request: Request, db: D1Database) {
  const user = await requireUser(request, db);
  const admin = await db
    .prepare("SELECT user_id FROM admin_users WHERE user_id = ?")
    .bind(user.id)
    .first();
  if (!admin) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function requireSuperAdmin(request: Request, db: D1Database) {
  const user = await requireUser(request, db);
  const admin = await db
    .prepare(
      `SELECT user_id FROM admin_users
       WHERE user_id = ? AND access_level = 'superadmin'`,
    )
    .bind(user.id)
    .first();
  if (!admin)
    throw new Response("Superadmin access required.", { status: 403 });
  return user;
}

export async function requireAdminScope(
  request: Request,
  db: D1Database,
  scope:
    "membership" | "verification" | "projects" | "campaigns" | "moderation",
) {
  const user = await requireUser(request, db);
  const admin = await db
    .prepare(
      `SELECT au.user_id
       FROM admin_users au
       LEFT JOIN admin_scopes s
         ON s.admin_user_id = au.user_id AND s.scope = ?
       WHERE au.user_id = ?
         AND (au.access_level = 'superadmin' OR s.scope IS NOT NULL)`,
    )
    .bind(scope, user.id)
    .first();
  if (!admin) throw new Response("Admin permission required.", { status: 403 });
  return user;
}

export async function redirectAuthenticatedUser(
  request: Request,
  db: D1Database,
) {
  const user = await getOptionalUser(request, db);
  if (user) throw redirect("/app");
}
