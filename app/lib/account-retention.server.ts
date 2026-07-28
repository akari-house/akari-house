type RetentionEnvironment = CloudflareEnvironment;

export async function processAccountRetention(env: RetentionEnvironment) {
  const runId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO retention_runs (id, run_type, status)
     VALUES (?, 'account_closure', 'running')`,
  )
    .bind(runId)
    .run();

  let affected = 0;
  try {
    const due = await env.DB.prepare(
      `SELECT acr.id, acr.user_id AS userId, p.avatar_key AS avatarKey
       FROM account_closure_requests acr
       LEFT JOIN profiles p ON p.user_id = acr.user_id
       WHERE acr.status = 'cooling_off'
         AND acr.scheduled_for <= datetime('now')
       ORDER BY acr.scheduled_for
       LIMIT 25`,
    ).all<{ id: string; userId: string; avatarKey: string | null }>();

    for (const request of due.results) {
      await env.DB.prepare(
        `UPDATE account_closure_requests
         SET status = 'processing', updated_at = datetime('now')
         WHERE id = ? AND status = 'cooling_off'`,
      )
        .bind(request.id)
        .run();

      if (request.avatarKey) await env.MEDIA.delete(request.avatarKey);
      const anonymisedEmail = `closed+${request.userId}@invalid.akari.local`;
      const anonymisedUsername = `closed-${request.userId.slice(0, 12)}`;

      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(
          request.userId,
        ),
        env.DB.prepare("DELETE FROM account_tokens WHERE user_id = ?").bind(
          request.userId,
        ),
        env.DB.prepare("DELETE FROM profile_contacts WHERE user_id = ?").bind(
          request.userId,
        ),
        env.DB.prepare(
          "DELETE FROM profile_social_accounts WHERE user_id = ?",
        ).bind(request.userId),
        env.DB.prepare(
          "DELETE FROM profile_share_settings WHERE user_id = ?",
        ).bind(request.userId),
        env.DB.prepare(
          "DELETE FROM profile_reputation_signals WHERE user_id = ?",
        ).bind(request.userId),
        env.DB.prepare("DELETE FROM event_interests WHERE user_id = ?").bind(
          request.userId,
        ),
        env.DB.prepare(
          `UPDATE profiles SET display_name = 'Former AKARI member',
             headline = NULL, bio = NULL, location = NULL, website_url = NULL,
             expertise = NULL, open_to = NULL, avatar_key = NULL,
             avatar_content_type = NULL, visibility = 'private',
             updated_at = datetime('now') WHERE user_id = ?`,
        ).bind(request.userId),
        env.DB.prepare(
          `UPDATE profile_visibility SET visibility = 'private',
             updated_at = datetime('now') WHERE user_id = ?`,
        ).bind(request.userId),
        env.DB.prepare(
          `UPDATE users SET email = ?, username = ?, password_hash = ?,
             status = 'restricted', email_verified_at = NULL,
             updated_at = datetime('now') WHERE id = ?`,
        ).bind(
          anonymisedEmail,
          anonymisedUsername,
          `closed:${crypto.randomUUID()}`,
          request.userId,
        ),
        env.DB.prepare(
          `UPDATE account_closure_requests
             SET status = 'completed', completed_at = datetime('now'),
                 updated_at = datetime('now') WHERE id = ?`,
        ).bind(request.id),
        env.DB.prepare(
          `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
             VALUES (?, NULL, 'account.anonymised', 'user', ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          request.userId,
          JSON.stringify({
            retentionRunId: runId,
            closureRequestId: request.id,
          }),
        ),
      ]);
      affected += 1;
    }

    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM sessions WHERE expires_at <= datetime('now')`,
      ),
      env.DB.prepare(
        `DELETE FROM account_tokens WHERE expires_at <= datetime('now')
             OR consumed_at IS NOT NULL`,
      ),
      env.DB.prepare(
        `UPDATE retention_runs SET status = 'completed',
           completed_at = datetime('now'), affected_records = ? WHERE id = ?`,
      ).bind(affected, runId),
    ]);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE retention_runs SET status = 'failed', completed_at = datetime('now'),
       affected_records = ?, metadata_json = ? WHERE id = ?`,
    )
      .bind(
        affected,
        JSON.stringify({
          error: error instanceof Error ? error.message : "unknown",
        }),
        runId,
      )
      .run();
    throw error;
  }
}
