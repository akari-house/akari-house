import type { ProfileRecord, Role } from "./domain";
import { canViewProfile } from "./visibility";

export async function getVisibleProfile(
  db: D1Database,
  username: string,
  viewerId: string | null,
) {
  const profile = await db
    .prepare(
      `SELECT p.user_id AS userId, u.username, p.display_name AS displayName,
            COALESCE(p.headline, '') AS headline,
            COALESCE(p.bio, '') AS bio, COALESCE(p.location, '') AS location,
            COALESCE(p.website_url, '') AS websiteUrl,
            COALESCE(p.expertise, '') AS expertise,
            COALESCE(p.open_to, '') AS openTo,
            COALESCE(v.visibility, p.visibility) AS visibility
     FROM profiles p JOIN users u ON u.id = p.user_id
     LEFT JOIN profile_visibility v ON v.user_id = p.user_id
     WHERE u.username = ? AND u.status = 'active'`,
    )
    .bind(username)
    .first<Omit<ProfileRecord, "roles">>();
  if (!profile) return null;

  let isConnected = false;
  if (
    viewerId &&
    viewerId !== profile.userId &&
    profile.visibility === "connections"
  ) {
    const connection = await db
      .prepare(
        `SELECT 1 AS connected FROM connections
       WHERE status = 'accepted'
         AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))`,
      )
      .bind(viewerId, profile.userId, profile.userId, viewerId)
      .first();
    isConnected = Boolean(connection);
  }

  if (
    !canViewProfile(profile.visibility, {
      ownerId: profile.userId,
      viewerId,
      isConnected,
    })
  ) {
    throw new Response("This profile is not available to you.", {
      status: 403,
    });
  }

  const roleRows = await db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .bind(profile.userId)
    .all<{ role: Role }>();
  return { ...profile, roles: roleRows.results.map((row) => row.role) };
}
