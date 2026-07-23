import { sha256 } from "./security.server";

export type AccountTokenPurpose = "email_verification" | "password_reset";

const tokenLifetimes: Record<AccountTokenPurpose, string> = {
  email_verification: "+24 hours",
  password_reset: "+30 minutes",
};

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function issueAccountToken(
  db: D1Database,
  userId: string,
  purpose: AccountTokenPurpose,
) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await db.batch([
    db
      .prepare(
        "UPDATE account_tokens SET consumed_at = datetime('now') WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL",
      )
      .bind(userId, purpose),
    db
      .prepare(
        "INSERT INTO account_tokens (id, user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))",
      )
      .bind(
        crypto.randomUUID(),
        userId,
        purpose,
        tokenHash,
        tokenLifetimes[purpose],
      ),
  ]);
  return token;
}

export async function findValidAccountToken(
  db: D1Database,
  token: string,
  purpose: AccountTokenPurpose,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT id, user_id AS userId
       FROM account_tokens
       WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .bind(await sha256(token), purpose)
    .first<{ id: string; userId: string }>();
}
