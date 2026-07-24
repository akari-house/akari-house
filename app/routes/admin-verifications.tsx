import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-verifications";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type VerificationRow = {
  userId: string;
  username: string;
  displayName: string;
  role: "founder" | "creator" | "investor";
  status: string;
  updatedAt: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "verification");
  const verifications = await db
    .prepare(
      `SELECT rv.user_id AS userId, u.username,
              p.display_name AS displayName, rv.role, rv.status,
              rv.updated_at AS updatedAt
       FROM role_verifications rv
       JOIN users u ON u.id = rv.user_id
       JOIN profiles p ON p.user_id = rv.user_id
       WHERE rv.status IN ('pending', 'declined', 'revoked')
       ORDER BY CASE rv.status WHEN 'pending' THEN 0 ELSE 1 END,
                rv.updated_at`,
    )
    .all<VerificationRow>();
  return { user, verifications: verifications.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "verification");
  const form = await request.formData();
  const userId = formText(form.get("userId"));
  const role = formText(form.get("role"));
  const intent = formText(form.get("intent"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (
    !["founder", "creator", "investor"].includes(role) ||
    !["verify", "decline"].includes(intent) ||
    decisionNote.length < 5 ||
    decisionNote.length > 500
  )
    return {
      error: "Choose a valid decision and record a 5 to 500 character note.",
    };
  const status = intent === "verify" ? "verified" : "declined";
  await db.batch([
    db
      .prepare(
        `UPDATE role_verifications SET status = ?, reviewed_by = ?,
         reviewed_at = datetime('now'), decision_note = ?,
         updated_at = datetime('now')
         WHERE user_id = ? AND role = ?`,
      )
      .bind(status, admin.id, decisionNote, userId, role),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'role.verification', ?, ?, '/app')`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        `${role[0].toUpperCase()}${role.slice(1)} verification updated`,
        status === "verified"
          ? `Your ${role} role is now verified.`
          : `Your ${role} verification was not approved. Review your profile before requesting another review.`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'role.verification_decision', 'user', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        userId,
        JSON.stringify({ role, status, decisionNote }),
      ),
  ]);
  return { saved: true };
}

export default function AdminVerifications({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Identity and role review</span>
            <h1>Founder, Creator and Investor verification</h1>
          </div>
          <Link className="button button-quiet" to="/admin/campaigns">
            Campaign proposals
          </Link>
        </header>
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
        {actionData?.saved && (
          <p className="notice success">Verification decision saved.</p>
        )}
        <div className="application-list">
          {loaderData.verifications.map((item) => (
            <article
              className="application-card"
              key={`${item.userId}:${item.role}`}
            >
              <div>
                <span className="chapter">
                  {item.role} · {item.status}
                </span>
                <h2>
                  <Link to={`/profiles/${item.username}`}>
                    {item.displayName}
                  </Link>
                </h2>
                <p>@{item.username}</p>
              </div>
              <Form method="post" className="application-actions">
                <input type="hidden" name="userId" value={item.userId} />
                <input type="hidden" name="role" value={item.role} />
                <label>
                  Decision note
                  <textarea
                    name="decisionNote"
                    minLength={5}
                    maxLength={500}
                    required
                  />
                </label>
                <button
                  className="button button-primary"
                  name="intent"
                  value="verify"
                  disabled={navigation.state !== "idle"}
                >
                  Verify {item.role}
                </button>
                <button
                  className="button button-quiet"
                  name="intent"
                  value="decline"
                  disabled={navigation.state !== "idle"}
                >
                  Decline
                </button>
              </Form>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
