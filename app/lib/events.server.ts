import { slugifyProject } from "./projects.server";

export async function canHostEvents(db: D1Database, userId: string) {
  const permission = await db
    .prepare(
      `SELECT 1 FROM interest_requests
       WHERE user_id = ? AND interest_type = 'event_host'
         AND status = 'approved'
       UNION ALL
       SELECT 1 FROM admin_users WHERE user_id = ?
       LIMIT 1`,
    )
    .bind(userId, userId)
    .first();
  return Boolean(permission);
}

export async function uniqueEventSlug(db: D1Database, title: string) {
  const base = slugifyProject(title) || "event";
  for (let suffix = 0; suffix < 20; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const exists = await db
      .prepare("SELECT 1 FROM events WHERE slug = ?")
      .bind(slug)
      .first();
    if (!exists) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
