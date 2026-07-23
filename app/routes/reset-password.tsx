import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { AuthLayout } from "~/layouts/AuthLayout";
import { findValidAccountToken } from "~/lib/account-tokens.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin, hashPassword } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const record = await findValidAccountToken(
    context.get(cloudflareContext).env.DB,
    token,
    "password_reset",
  );
  return { token, valid: Boolean(record) };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const token = formText(formData.get("token"));
  const password = formText(formData.get("password"));
  const confirmation = formText(formData.get("confirmation"));
  if (password.length < 12 || password.length > 128)
    return { error: "Use 12 to 128 characters." };
  if (password !== confirmation)
    return { error: "The passwords do not match." };

  const db = context.get(cloudflareContext).env.DB;
  const record = await findValidAccountToken(db, token, "password_reset");
  if (!record) return { invalid: true as const };
  const passwordHash = await hashPassword(password);
  const consumed = await db
    .prepare(
      "UPDATE account_tokens SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL AND expires_at > datetime('now')",
    )
    .bind(record.id)
    .run();
  if ((consumed.meta.changes ?? 0) !== 1) return { invalid: true as const };
  await db.batch([
    db
      .prepare(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(passwordHash, record.userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(record.userId),
    db
      .prepare(
        "UPDATE account_tokens SET consumed_at = datetime('now') WHERE user_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL",
      )
      .bind(record.userId),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id) VALUES (?, ?, 'account.password_reset', 'user', ?)",
      )
      .bind(crypto.randomUUID(), record.userId, record.userId),
  ]);
  return { changed: true as const };
}

export default function ResetPassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  if (actionData?.changed)
    return (
      <AuthLayout eyebrow="Password changed" title="The door is open again">
        <div className="status-card success" role="status">
          <p>
            Your password has been changed. You can now return to the House.
          </p>
          <Link className="button button-primary button-wide" to="/login">
            Log in
          </Link>
        </div>
      </AuthLayout>
    );

  const invalid = !loaderData.valid || actionData?.invalid;
  return (
    <AuthLayout eyebrow="Account recovery" title="Choose a new password">
      {invalid ? (
        <div className="status-card" role="alert">
          <h2>This reset link is no longer valid</h2>
          <p>It may have expired or already been used.</p>
          <Link
            className="button button-quiet button-wide"
            to="/forgot-password"
          >
            Request another link
          </Link>
        </div>
      ) : (
        <Form method="post" className="form-stack">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <input type="hidden" name="token" value={loaderData.token} />
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <button
            className="button button-primary button-wide"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Change password"
              : "Changing password..."}
          </button>
        </Form>
      )}
    </AuthLayout>
  );
}
