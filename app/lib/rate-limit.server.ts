import { sha256 } from "./security.server";

export function isWithinRateLimit(attempts: number | null, limit: number) {
  return (attempts ?? limit + 1) <= limit;
}

export async function consumeAuthLimit(
  db: D1Database,
  request: Request,
  bucket: string,
  subject: string,
  limit: number,
  windowMinutes: number,
) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const subjectHash = await sha256(`${bucket}:${ip}:${subject.toLowerCase()}`);
  await db
    .prepare(
      `INSERT INTO auth_rate_limits (bucket, subject_hash)
       VALUES (?, ?)
       ON CONFLICT(bucket, subject_hash) DO UPDATE SET
         attempts = CASE
           WHEN window_started_at <= datetime('now', ?) THEN 1
           ELSE attempts + 1
         END,
         window_started_at = CASE
           WHEN window_started_at <= datetime('now', ?) THEN datetime('now')
           ELSE window_started_at
         END`,
    )
    .bind(
      bucket,
      subjectHash,
      `-${windowMinutes} minutes`,
      `-${windowMinutes} minutes`,
    )
    .run();
  const row = await db
    .prepare(
      "SELECT attempts FROM auth_rate_limits WHERE bucket = ? AND subject_hash = ?",
    )
    .bind(bucket, subjectHash)
    .first<{ attempts: number }>();
  return isWithinRateLimit(row?.attempts ?? null, limit);
}

export async function requireActionRateLimit(
  db: D1Database,
  request: Request,
  bucket: string,
  userId: string,
  limit: number,
  windowMinutes: number,
) {
  const allowed = await consumeAuthLimit(
    db,
    request,
    `action:${bucket}`,
    userId,
    limit,
    windowMinutes,
  );
  if (!allowed)
    throw new Response("Too many requests. Please try again later.", {
      status: 429,
      headers: { "Retry-After": String(windowMinutes * 60) },
    });
}
