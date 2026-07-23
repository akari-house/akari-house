import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/verify-email";
import { AuthLayout } from "~/layouts/AuthLayout";
import { findValidAccountToken } from "~/lib/account-tokens.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";

export function meta() {
  return [{ title: "Confirm email | AKARI House" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const db = context.get(cloudflareContext).env.DB;
  return {
    token,
    valid: Boolean(
      await findValidAccountToken(db, token, "email_verification"),
    ),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue : "";
  const db = context.get(cloudflareContext).env.DB;
  const record = await findValidAccountToken(db, token, "email_verification");
  if (!record) return { confirmed: false as const };

  const results = await db.batch([
    db
      .prepare(
        "UPDATE account_tokens SET consumed_at = datetime('now') WHERE id = ? AND consumed_at IS NULL AND expires_at > datetime('now')",
      )
      .bind(record.id),
    db
      .prepare(
        "UPDATE users SET email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
      )
      .bind(record.userId),
    db
      .prepare(
        "UPDATE membership_applications SET status = 'pending_review', updated_at = datetime('now') WHERE user_id = ? AND status = 'pending_email'",
      )
      .bind(record.userId),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id) VALUES (?, ?, 'membership.email_verified', 'membership_application', ?)",
      )
      .bind(crypto.randomUUID(), record.userId, record.userId),
  ]);
  return { confirmed: (results[0].meta.changes ?? 0) === 1 };
}

export default function VerifyEmail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const confirmed = actionData?.confirmed;
  return (
    <AuthLayout eyebrow="Membership desk" title="Confirm your email">
      {confirmed ? (
        <div className="status-card success" role="status">
          <span className="status-mark" aria-hidden="true">
            光
          </span>
          <h2>Your request is under review</h2>
          <p>
            Your address is confirmed. A person at the Membership Desk will
            review your request before member access is opened.
          </p>
          <Link className="button button-primary button-wide" to="/">
            Return to the House
          </Link>
        </div>
      ) : loaderData.valid && confirmed !== false ? (
        <>
          <p className="form-intro">
            Confirming your address moves your application to human review. It
            does not create member access immediately.
          </p>
          <Form method="post" className="form-stack">
            <input type="hidden" name="token" value={loaderData.token} />
            <button
              className="button button-primary button-wide"
              type="submit"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state === "idle" ? "Confirm email" : "Confirming..."}
            </button>
          </Form>
        </>
      ) : (
        <div className="status-card" role="alert">
          <h2>This confirmation link is no longer valid</h2>
          <p>
            It may have expired or already been used. Contact the Membership
            Desk if you still need help with your request.
          </p>
          <Link className="button button-quiet button-wide" to="/register">
            Return to membership
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
