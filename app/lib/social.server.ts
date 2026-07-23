import {
  socialPlatforms,
  type SocialPlatform,
} from "./domain";

export interface SocialAccount {
  platform: SocialPlatform;
  profileUrl: string;
  followerCount: number | null;
  countSource: string;
  syncStatus: string;
  lastSyncedAt: string | null;
}

export async function loadSocialAccounts(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT platform, profile_url AS profileUrl, follower_count AS followerCount,
              count_source AS countSource, sync_status AS syncStatus,
              last_synced_at AS lastSyncedAt
       FROM profile_social_accounts WHERE user_id = ? ORDER BY platform`,
    )
    .bind(userId)
    .all<SocialAccount>();
  const byPlatform = new Map(rows.results.map((row) => [row.platform, row]));
  return socialPlatforms.map(
    (platform) =>
      byPlatform.get(platform) ?? {
        platform,
        profileUrl: "",
        followerCount: null,
        countSource: "unavailable",
        syncStatus: "manual",
        lastSyncedAt: null,
      },
  );
}

function youtubeHandle(profileUrl: string) {
  try {
    const url = new URL(profileUrl);
    if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
    const segment = url.pathname.split("/").filter(Boolean)[0];
    return segment?.startsWith("@") ? segment : null;
  } catch {
    return null;
  }
}

export async function syncDailySocialMetrics(
  env: CloudflareEnvironment & { YOUTUBE_API_KEY?: string },
) {
  if (!env.YOUTUBE_API_KEY) return;
  const accounts = await env.DB.prepare(
    `SELECT user_id AS userId, profile_url AS profileUrl
     FROM profile_social_accounts
     WHERE platform = 'youtube' AND profile_url <> ''
       AND (last_synced_at IS NULL OR last_synced_at < datetime('now', '-20 hours'))
     LIMIT 100`,
  ).all<{ userId: string; profileUrl: string }>();

  for (const account of accounts.results) {
    const handle = youtubeHandle(account.profileUrl);
    if (!handle) continue;
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
      endpoint.searchParams.set("part", "statistics");
      endpoint.searchParams.set("forHandle", handle);
      endpoint.searchParams.set("key", env.YOUTUBE_API_KEY);
      const response = await fetch(endpoint);
      const payload: {
        items?: Array<{ statistics?: { subscriberCount?: string } }>;
      } = await response.json();
      const count = Number(payload.items?.[0]?.statistics?.subscriberCount);
      if (!response.ok || !Number.isSafeInteger(count) || count < 0)
        throw new Error("YouTube statistics unavailable");
      await env.DB.batch([
        env.DB
          .prepare(
            `UPDATE profile_social_accounts
             SET follower_count = ?, count_source = 'official_api',
                 sync_status = 'synced', last_synced_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE user_id = ? AND platform = 'youtube'`,
          )
          .bind(count, account.userId),
        env.DB
          .prepare(
            `INSERT INTO social_metric_snapshots
             (id, user_id, platform, follower_count, source)
             VALUES (?, ?, 'youtube', ?, 'official_api')`,
          )
          .bind(crypto.randomUUID(), account.userId, count),
      ]);
    } catch {
      await env.DB
        .prepare(
          `UPDATE profile_social_accounts
           SET sync_status = 'error', last_synced_at = datetime('now'),
               updated_at = datetime('now')
           WHERE user_id = ? AND platform = 'youtube'`,
        )
        .bind(account.userId)
        .run();
    }
  }
}
