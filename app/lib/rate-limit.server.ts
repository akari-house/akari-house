import { sha256 } from "./security.server";

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
  return (row?.attempts ?? limit + 1) <= limit;
}
