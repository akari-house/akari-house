import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/account-settings";
import { SiteHeader } from "~/components/SiteHeader";
import { clearSessionCookie, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const closure = await db
    .prepare(
      `SELECT status, reason, requested_at AS requestedAt,
              scheduled_for AS scheduledFor, cancelled_at AS cancelledAt
       FROM account_closure_requests WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<{
      status: string;
      reason: string | null;
      requestedAt: string;
      scheduledFor: string;
      cancelledAt: string | null;
    }>();
  const latestExport = await db
    .prepare(
      `SELECT status, requested_at AS requestedAt, completed_at AS completedAt
       FROM data_export_requests WHERE user_id = ?
       ORDER BY requested_at DESC LIMIT 1`,
    )
    .bind(user.id)
    .first<{ status: string; requestedAt: string; completedAt: string | null }>();
  return { user, closure, latestExport };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "request-closure") {
    const confirmation = formText(form.get("confirmation")).trim();
    const reason = formText(form.get("reason")).trim();
    if (confirmation !== user.username)
      return { error: "Type your username exactly to confirm account closure." };
    if (reason.length > 500)
      return { error: "Keep the optional reason within 500 characters." };

    await db.batch([
      db
        .prepare(
          `INSERT INTO account_closure_requests
           (id, user_id, status, reason, scheduled_for)
           VALUES (?, ?, 'cooling_off', ?, datetime('now', '+14 days'))
           ON CONFLICT(user_id) DO UPDATE SET
             status = 'cooling_off', reason = excluded.reason,
             requested_at = datetime('now'), scheduled_for = datetime('now', '+14 days'),
             cancelled_at = NULL, completed_at = NULL, updated_at = datetime('now')`,
        )
        .bind(crypto.randomUUID(), user.id, reason || null),
      db
        .prepare(
          `UPDATE profiles SET visibility = 'private', updated_at = datetime('now')
           WHERE user_id = ?`,
        )
        .bind(user.id),
      db
        .prepare(
          `UPDATE profile_visibility SET visibility = 'private', updated_at = datetime('now')
           WHERE user_id = ?`,
        )
        .bind(user.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'account.closure_requested', 'user', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          user.id,
          JSON.stringify({ coolingOffDays: 14, reasonProvided: Boolean(reason) }),
        ),
    ]);
    throw redirect("/settings/account?closure=requested");
  }

  if (intent === "cancel-closure") {
    await db.batch([
      db
        .prepare(
          `UPDATE account_closure_requests
           SET status = 'cancelled', cancelled_at = datetime('now'),
               updated_at = datetime('now')
           WHERE user_id = ? AND status = 'cooling_off'`,
        )
        .bind(user.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id)
           VALUES (?, ?, 'account.closure_cancelled', 'user', ?)`,
        )
        .bind(crypto.randomUUID(), user.id, user.id),
    ]);
    throw redirect("/settings/account?closure=cancelled");
  }

  if (intent === "sign-out-everywhere") {
    await db
      .prepare("DELETE FROM sessions WHERE user_id = ?")
      .bind(user.id)
      .run();
    return redirect("/login?sessions=cleared", {
      headers: { "Set-Cookie": clearSessionCookie(request) },
    });
  }

  throw new Response("Invalid account action.", { status: 400 });
}

export default function AccountSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const activeClosure = loaderData.closure?.status === "cooling_off";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Account rights & privacy</span>
            <h1>Control your AKARI account and data.</h1>
            <p>
              Download a copy of your information, review privacy choices,
              manage active sessions or begin a reversible account closure.
            </p>
          </div>
          <Link className="button button-quiet" to="/app">
            Return to your House
          </Link>
        </header>

        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className="status-card">
          <span className="eyebrow">Your data</span>
          <h2>Download a portable account copy</h2>
          <p>
            The export includes your account, roles, profile, connections,
            project activity, campaign activity, notifications and legal
            acceptance records in JSON format.
          </p>
          <a className="button button-primary" href="/settings/account/export">
            Download my data
          </a>
          {loaderData.latestExport && (
            <small>
              Latest export: {loaderData.latestExport.status} ·{" "}
              {new Date(loaderData.latestExport.requestedAt).toLocaleString()}
            </small>
          )}
        </section>

        <section className="status-card">
          <span className="eyebrow">Sessions</span>
          <h2>Sign out everywhere</h2>
          <p>
            End every active AKARI session, including this browser. Use this
            after using a shared device or when you believe access was exposed.
          </p>
          <Form method="post">
            <button
              className="button button-quiet"
              name="intent"
              value="sign-out-everywhere"
              disabled={pending}
            >
              Sign out all sessions
            </button>
          </Form>
        </section>

        <section className="status-card">
          <span className="eyebrow">Account closure</span>
          {activeClosure ? (
            <>
              <h2>Your account is scheduled for closure.</h2>
              <p>
                Your profile was made private. Permanent anonymisation is
                scheduled after the 14-day cooling-off period on{" "}
                <strong>
                  {new Date(loaderData.closure!.scheduledFor).toLocaleString()}
                </strong>
                . You may cancel until processing begins.
              </p>
              <Form method="post">
                <button
                  className="button button-primary"
                  name="intent"
                  value="cancel-closure"
                  disabled={pending}
                >
                  Keep my account
                </button>
              </Form>
            </>
          ) : (
            <>
              <h2>Close your AKARI account</h2>
              <p>
                Closure starts a 14-day cooling-off period and immediately makes
                your profile private. After the deadline, direct identifiers and
                private profile data are removed. Records that AKARI must retain
                for security, disputes or legal obligations remain minimised and
                access-controlled.
              </p>
              <Form method="post" className="form-stack">
                <label>
                  Optional reason
                  <textarea name="reason" rows={3} maxLength={500} />
                </label>
                <label>
                  Type your username to confirm: {loaderData.user.username}
                  <input name="confirmation" autoComplete="off" required />
                </label>
                <button
                  className="button button-quiet"
                  name="intent"
                  value="request-closure"
                  disabled={pending}
                >
                  Begin account closure
                </button>
              </Form>
            </>
          )}
        </section>

        <section className="status-card">
          <span className="eyebrow">Policies</span>
          <h2>Understand how AKARI handles information</h2>
          <p>
            Review the current Privacy Notice, Terms and Community Guidelines.
            AKARI records the policy version accepted during registration.
          </p>
          <div className="member-next-actions">
            <Link to="/privacy">Privacy Notice</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/community-guidelines">Community Guidelines</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
