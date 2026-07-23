import { redirect } from "react-router";
import { getOptionalUser, requireUser } from "./auth.server";

export type MembershipStatus =
  "pending_email" | "pending_review" | "approved" | "declined" | "waitlisted";

export async function membershipStatusForUser(db: D1Database, userId: string) {
  return db
    .prepare(
      `SELECT ma.id, ma.status, ma.created_at AS createdAt,
              u.email, u.email_verified_at AS emailVerifiedAt
       FROM membership_applications ma
       JOIN users u ON u.id = ma.user_id
       WHERE ma.user_id = ?`,
    )
    .bind(userId)
    .first<{
      id: string;
      status: MembershipStatus;
      createdAt: string;
      email: string;
      emailVerifiedAt: string | null;
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

export async function redirectAuthenticatedUser(
  request: Request,
  db: D1Database,
) {
  const user = await getOptionalUser(request, db);
  if (user) throw redirect("/app");
}
