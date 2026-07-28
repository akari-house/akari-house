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
            u.status AS accountStatus,
            COALESCE(p.headline, '') AS headline,
            COALESCE(p.bio, '') AS bio, COALESCE(p.location, '') AS location,
            COALESCE(p.website_url, '') AS websiteUrl,
            COALESCE(p.expertise, '') AS expertise,
            COALESCE(p.open_to, '') AS openTo,
            COALESCE(p.avatar_key, '') AS avatarKey,
            COALESCE(v.visibility, p.visibility) AS visibility,
            COALESCE(pss.show_location, 0) AS showLocation,
            COALESCE(pss.languages_json, '[]') AS languagesJson,
            COALESCE(pss.show_languages, 1) AS showLanguages
     FROM profiles p JOIN users u ON u.id = p.user_id
     LEFT JOIN profile_visibility v ON v.user_id = p.user_id
     LEFT JOIN profile_share_settings pss ON pss.user_id = p.user_id
     WHERE u.username = ?`,
    )
    .bind(username)
    .first<
      Omit<ProfileRecord, "roles"> & {
        accountStatus: string;
        showLocation: number;
        languagesJson: string;
        showLanguages: number;
      }
    >();
  if (!profile) return null;
  if (profile.accountStatus !== "active" && viewerId !== profile.userId)
    return null;

  let isConnected = false;
  const viewerIsMember =
    viewerId === profile.userId ||
    Boolean(
      viewerId &&
      (await db
        .prepare(
          `SELECT 1 FROM membership_applications
             WHERE user_id = ? AND status = 'approved'`,
        )
        .bind(viewerId)
        .first()),
    );
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
      viewerIsMember,
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
  const isOwner = viewerId === profile.userId;
  let languages: string[] = [];
  if (isOwner || profile.showLanguages === 1) {
    try {
      const parsed: unknown = JSON.parse(profile.languagesJson);
      if (Array.isArray(parsed))
        languages = parsed.filter(
          (language): language is string => typeof language === "string",
        );
    } catch {
      languages = [];
    }
  }
  return {
    ...profile,
    location: isOwner || profile.showLocation === 1 ? profile.location : "",
    languages,
    roles: roleRows.results.map((row) => row.role),
  };
}
