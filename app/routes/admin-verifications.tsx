import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-verifications";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
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
  evidenceCategory: string | null;
  reviewDueAt: string | null;
};

const evidenceCategories = [
  "identity_and_profile",
  "company_or_project",
  "creator_channels",
  "investment_activity",
  "professional_references",
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireAdminScope(request, db, "verification");
  await db.prepare(
    `UPDATE verification_provenance SET status = 'expired', updated_at = datetime('now')
     WHERE status = 'active' AND review_due_at IS NOT NULL
       AND review_due_at <= datetime('now')`,
  ).run();
  const verifications = await db
    .prepare(
      `SELECT rv.user_id AS userId, u.username,
              p.display_name AS displayName, rv.role, rv.status,
              rv.updated_at AS updatedAt,
              vp.evidence_category AS evidenceCategory,
              vp.review_due_at AS reviewDueAt
       FROM role_verifications rv
       JOIN users u ON u.id = rv.user_id
       JOIN profiles p ON p.user_id = rv.user_id
       LEFT JOIN verification_provenance vp
         ON vp.user_id = rv.user_id AND vp.role = rv.role AND vp.status = 'active'
       WHERE rv.status IN ('pending', 'declined', 'revoked')
          OR vp.status = 'active'
       ORDER BY CASE rv.status WHEN 'pending' THEN 0 ELSE 1 END,
                rv.updated_at`,
    )
    .all<VerificationRow>();
  return { user, verifications: verifications.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const admin = await requireAdminScope(request, db, "verification");
  const form = await request.formData();
  const userId = formText(form.get("userId"));
  const role = formText(form.get("role"));
  const intent = formText(form.get("intent"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  const evidenceCategory = formText(form.get("evidenceCategory"));
  const reviewMonths = Number(formText(form.get("reviewMonths")) || "12");
  if (
    !["founder", "creator", "investor"].includes(role) ||
    !["verify", "decline", "revoke"].includes(intent) ||
    decisionNote.length < 5 ||
    decisionNote.length > 500 ||
    (intent === "verify" &&
      (!evidenceCategories.includes(
        evidenceCategory as (typeof evidenceCategories)[number],
      ) ||
        ![3, 6, 12, 24].includes(reviewMonths)))
  )
    return {
      error:
        "Choose a valid decision, evidence category, review period and a 5 to 500 character note.",
    };

  const status =
    intent === "verify" ? "verified" : intent === "revoke" ? "revoked" : "declined";
  const statements = [
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
        `UPDATE verification_provenance SET status = 'revoked',
         updated_at = datetime('now')
         WHERE user_id = ? AND role = ? AND status = 'active'`,
      )
      .bind(userId, role),
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
          ? `Your ${role} role is verified until its scheduled review.`
          : status === "revoked"
            ? `Your ${role} verification was revoked and requires a fresh review.`
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
        JSON.stringify({
          role,
          status,
          decisionNote,
          evidenceCategory: intent === "verify" ? evidenceCategory : null,
          reviewMonths: intent === "verify" ? reviewMonths : null,
        }),
      ),
  ];
  if (intent === "verify")
    statements.splice(
      2,
      0,
      db
        .prepare(
          `INSERT INTO verification_provenance
           (id, user_id, role, evidence_category, verified_by,
            review_due_at, note)
           VALUES (?, ?, ?, ?, ?, datetime('now', ?), ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          role,
          evidenceCategory,
          admin.id,
          `+${reviewMonths} months`,
          decisionNote,
        ),
    );
  await db.batch(statements);
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
            <h1>Verification with evidence and review dates</h1>
            <p>
              Every active badge records its evidence category, reviewer and
              scheduled refresh date. Verification is never treated as permanent.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/operations">
            Operations centre
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            Verification decision and provenance saved.
          </p>
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
                {item.evidenceCategory && (
                  <p>
                    <strong>Evidence:</strong>{" "}
                    {item.evidenceCategory.replaceAll("_", " ")}
                  </p>
                )}
                {item.reviewDueAt && (
                  <small>
                    Review due {new Date(item.reviewDueAt).toLocaleDateString()}
                  </small>
                )}
              </div>
              <Form method="post" className="application-actions">
                <input type="hidden" name="userId" value={item.userId} />
                <input type="hidden" name="role" value={item.role} />
                <label>
                  Evidence category
                  <select name="evidenceCategory" defaultValue="identity_and_profile">
                    {evidenceCategories.map((category) => (
                      <option value={category} key={category}>
                        {category.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Review again after
                  <select name="reviewMonths" defaultValue="12">
                    {[3, 6, 12, 24].map((months) => (
                      <option value={months} key={months}>
                        {months} months
                      </option>
                    ))}
                  </select>
                </label>
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
                {item.status === "verified" && (
                  <button
                    className="button button-quiet"
                    name="intent"
                    value="revoke"
                    disabled={navigation.state !== "idle"}
                  >
                    Revoke verification
                  </button>
                )}
              </Form>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
