import type { SessionUser } from "./domain";

export function slugifyProject(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function hasRole(user: SessionUser, role: string) {
  return user.roles.includes(role as (typeof user.roles)[number]);
}

export async function uniqueProjectSlug(db: D1Database, title: string) {
  const base = slugifyProject(title) || "project";
  for (let suffix = 0; suffix < 20; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const exists = await db
      .prepare("SELECT 1 FROM projects WHERE slug = ?")
      .bind(slug)
      .first();
    if (!exists) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
