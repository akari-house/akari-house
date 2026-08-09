export type CrmCreatorSocialSource = string;

export interface CrmCreatorSocial {
  platform: string;
  profileUrl: string;
  followerCount: number | null;
  countSource: CrmCreatorSocialSource;
  syncStatus: string;
  lastSyncedAt: string | null;
}

export interface CrmCreatorDirectoryRecord {
  akariCreatorId: string;
  username: string;
  profileUrl: string;
  displayName: string;
  headline: string;
  location: string;
  websiteUrl: string;
  expertise: string;
  openTo: string;
  avatarUrl: string | null;
  languages: string[];
  creatorVerificationStatus: string;
  sorsaScore: number | null;
  sorsaSource: string;
  xScore: number | null;
  xScoreSource: string;
  socials: CrmCreatorSocial[];
  identitySource: "AKARI_HOUSE";
  profileDataStatus: "PROFILE_PROVIDED";
}

interface CreatorRow {
  userId: string;
  username: string;
  displayName: string;
  headline: string;
  location: string;
  websiteUrl: string;
  expertise: string;
  openTo: string;
  avatarKey: string;
  languagesJson: string;
  showLocation: number;
  showLanguages: number;
  creatorVerificationStatus: string | null;
  sorsaScore: number | null;
  sorsaSource: string | null;
  xScore: number | null;
  xScoreSource: string | null;
}

interface SocialRow {
  userId: string;
  platform: string;
  profileUrl: string;
  followerCount: number | null;
  countSource: string;
  syncStatus: string;
  lastSyncedAt: string | null;
}

function safeLanguages(value: string, visible: boolean) {
  if (!visible) return [];
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function mapPublicCreatorRow(
  row: CreatorRow,
  socials: CrmCreatorSocial[] = [],
): CrmCreatorDirectoryRecord {
  const username = row.username.trim();
  return {
    akariCreatorId: row.userId,
    username,
    profileUrl: `https://akarihouse.com/profiles/${encodeURIComponent(username)}`,
    displayName: row.displayName.trim(),
    headline: row.headline.trim(),
    location: row.showLocation === 1 ? row.location.trim() : "",
    websiteUrl: row.websiteUrl.trim(),
    expertise: row.expertise.trim(),
    openTo: row.openTo.trim(),
    avatarUrl: row.avatarKey
      ? `https://akarihouse.com/media/profile/${encodeURIComponent(username)}?v=${encodeURIComponent(row.avatarKey)}`
      : null,
    languages: safeLanguages(row.languagesJson, row.showLanguages === 1),
    creatorVerificationStatus: row.creatorVerificationStatus ?? "unverified",
    sorsaScore: row.sorsaScore,
    sorsaSource: row.sorsaSource ?? "unavailable",
    xScore: row.xScore,
    xScoreSource: row.xScoreSource ?? "unavailable",
    socials,
    identitySource: "AKARI_HOUSE",
    profileDataStatus: "PROFILE_PROVIDED",
  };
}

export async function loadPublicCrmCreatorFeed(
  db: D1Database,
  options: { after?: string; limit?: number } = {},
) {
  const after = String(options.after ?? "")
    .trim()
    .toLowerCase();
  const limit = Math.max(
    1,
    Math.min(500, Math.floor(Number(options.limit) || 200)),
  );
  const creators = await db
    .prepare(
      `SELECT u.id AS userId, u.username,
              p.display_name AS displayName,
              COALESCE(p.headline, '') AS headline,
              COALESCE(p.location, '') AS location,
              COALESCE(p.website_url, '') AS websiteUrl,
              COALESCE(p.expertise, '') AS expertise,
              COALESCE(p.open_to, '') AS openTo,
              COALESCE(p.avatar_key, '') AS avatarKey,
              COALESCE(pss.languages_json, '[]') AS languagesJson,
              COALESCE(pss.show_location, 0) AS showLocation,
              COALESCE(pss.show_languages, 1) AS showLanguages,
              COALESCE(rv.status, 'unverified') AS creatorVerificationStatus,
              prs.sorsa_score AS sorsaScore,
              COALESCE(prs.sorsa_source, 'unavailable') AS sorsaSource,
              prs.x_score AS xScore,
              COALESCE(prs.x_score_source, 'unavailable') AS xScoreSource
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator'
         JOIN profiles p ON p.user_id = u.id
         LEFT JOIN profile_visibility pv ON pv.user_id = u.id
         LEFT JOIN profile_share_settings pss ON pss.user_id = u.id
         LEFT JOIN profile_reputation_signals prs ON prs.user_id = u.id
         LEFT JOIN role_verifications rv ON rv.user_id = u.id AND rv.role = 'creator'
        WHERE u.status = 'active'
          AND COALESCE(pv.visibility, p.visibility) = 'public'
          AND (? = '' OR lower(u.username) > ?)
        ORDER BY lower(u.username), u.id
        LIMIT ?`,
    )
    .bind(after, after, limit)
    .all<CreatorRow>();

  const creatorIds = creators.results.map((row) => row.userId);
  const socialsByCreator = new Map<string, CrmCreatorSocial[]>();
  if (creatorIds.length) {
    const placeholders = creatorIds.map(() => "?").join(",");
    const socials = await db
      .prepare(
        `SELECT user_id AS userId, platform,
                COALESCE(profile_url, '') AS profileUrl,
                follower_count AS followerCount,
                COALESCE(count_source, 'unavailable') AS countSource,
                COALESCE(sync_status, 'manual') AS syncStatus,
                last_synced_at AS lastSyncedAt
           FROM profile_social_accounts
          WHERE user_id IN (${placeholders})
            AND COALESCE(profile_url, '') <> ''
          ORDER BY user_id, platform`,
      )
      .bind(...creatorIds)
      .all<SocialRow>();
    for (const row of socials.results) {
      const list = socialsByCreator.get(row.userId) ?? [];
      list.push({
        platform: row.platform,
        profileUrl: row.profileUrl,
        followerCount: row.followerCount,
        countSource: row.countSource,
        syncStatus: row.syncStatus,
        lastSyncedAt: row.lastSyncedAt,
      });
      socialsByCreator.set(row.userId, list);
    }
  }

  const items = creators.results.map((row) =>
    mapPublicCreatorRow(row, socialsByCreator.get(row.userId) ?? []),
  );
  return {
    schemaVersion: "2026-08-09.1",
    source: "AKARI_HOUSE_PUBLIC_CREATOR_DIRECTORY",
    profileDataStatus: "PROFILE_PROVIDED" as const,
    publicProfilesOnly: true,
    items,
    nextAfter: items.length === limit ? (items.at(-1)?.username ?? null) : null,
  };
}
