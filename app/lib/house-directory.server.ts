import type { HouseDirectoryEntry } from "./house-directory";

const selectFields = `id, category, name, title, biography,
  image_key AS imageKey, website_url AS websiteUrl, x_url AS xUrl,
  linkedin_url AS linkedinUrl, instagram_url AS instagramUrl,
  tiktok_url AS tiktokUrl, youtube_url AS youtubeUrl,
  telegram_url AS telegramUrl, display_order AS displayOrder, status,
  updated_at AS imageVersion`;

export async function getPublishedHouseDirectory(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT ${selectFields}
       FROM house_directory_entries
       WHERE status = 'published'
       ORDER BY CASE category
         WHEN 'team' THEN 1 WHEN 'advisor' THEN 2 WHEN 'supporter' THEN 3
         WHEN 'partner' THEN 4 ELSE 5 END,
         display_order, name`,
    )
    .all<HouseDirectoryEntry>();
  return result.results;
}

export async function getAllHouseDirectory(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT ${selectFields}
       FROM house_directory_entries
       WHERE status != 'archived'
       ORDER BY CASE category
         WHEN 'team' THEN 1 WHEN 'advisor' THEN 2 WHEN 'supporter' THEN 3
         WHEN 'partner' THEN 4 ELSE 5 END,
         display_order, name`,
    )
    .all<HouseDirectoryEntry>();
  return result.results;
}

export function safeExternalUrl(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
