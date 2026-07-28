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
  reviewedAt: string | null;
  decisionNote: string;
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

function displayStatus(item: VerificationRow) {
  if (
    item.status === "pending" &&
    item.reviewedAt &&
    item.decisionNote.trim().length > 0
  )
    return "on hold";
  if (item.status === "verified") return "approved";
  if (item.status === "declined" || item.status === "revoked")
    return "rejected";
  return item.status;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireAdminScope(request, db, "verification");
  await db
    .prepare(
      `UPDATE verification_provenance SET status = 'expired', updated_at = datetime('now')
     WHERE status = 'active' AND review_due_at IS NOT NULL
       AND review_due_at <= datetime('now')`,
    )
    .run();
  const verifications = await db
    .prepare(
      `SELECT rv.user_id AS userId, u.username,
              p.display_name AS displayName, rv.role, rv.status,
              rv.updated_at AS updatedAt,
              rv.reviewed_at AS reviewedAt,
              rv.decision_note AS decisionNote,
              vp.evidence_category AS evidenceCategory,
              vp.review_due_at AS reviewDueAt
       FROM role_verifications rv
       JOIN users u ON u.id = rv.user_id
       JOIN profiles p ON p.user_id = rv.user_id
       LEFT JOIN verification_provenance vp
         ON vp.user_id = rv.user_id AND vp.role = rv.role AND vp.status = 'active'
       WHERE rv.status IN ('pending', 'declined', 'revoked')
          OR vp.status = 'active'
       ORDER BY CASE rv.status
                  WHEN 'pending' THEN 0
                  WHEN 'verified' THEN 1
                  ELSE 2
                END,
                rv.updated_at DESC`,
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
    !["verify", "hold", "decline", "revoke"].includes(intent) ||
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
    intent === "verify"
      ? "verified"
      : intent === "hold"
        ? "pending"
        : intent === "revoke"
          ? "revoked"
          : "declined";
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
          ? `Your ${role} role is approved until its scheduled review.`
          : intent === "hold"
            ? `Your ${role} verification is on hold while additional evidence is reviewed.`
            : status === "revoked"
              ? `Your ${role} verification was rejected and requires a fresh review.`
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
          intent,
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
  const busy = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Identity and role review</span>
            <h1>Verification approval centre</h1>
            <p>
              Review every role claim in one compact queue. Open a row only when
              you need the evidence, note and decision controls.
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

        <div className="admin-queue-toolbar">
          <p className="member-directory-summary" aria-live="polite">
            <strong>{loaderData.verifications.length}</strong>{" "}
            {loaderData.verifications.length === 1 ? "claim" : "claims"} in the
            review centre
          </p>
        </div>

        <section className="admin-review-list" aria-label="Verification claims">
          {loaderData.verifications.map((item) => {
            const status = displayStatus(item);
            const rejectIntent =
              item.status === "verified" ? "revoke" : "decline";
            return (
              <details
                className="admin-review-item"
                key={`${item.userId}:${item.role}`}
              >
                <summary>
                  <span className="admin-review-identity">
                    <strong>{item.displayName}</strong>
                    <span>@{item.username}</span>
                  </span>
                  <span className="admin-review-status">
                    <strong>{item.role}</strong>
                    <span>Role claim</span>
                  </span>
                  <span className="admin-review-status">
                    <strong>{status}</strong>
                    <span>
                      {item.evidenceCategory
                        ? item.evidenceCategory.replaceAll("_", " ")
                        : "Evidence not recorded"}
                    </span>
                  </span>
                  <time dateTime={item.reviewDueAt ?? item.updatedAt}>
                    {item.reviewDueAt
                      ? `Review ${new Date(item.reviewDueAt).toLocaleDateString()}`
                      : `Updated ${new Date(item.updatedAt).toLocaleDateString()}`}
                  </time>
                </summary>

                <div className="admin-review-body">
                  <div className="admin-review-evidence">
                    <span className="chapter">Current review record</span>
                    <h2>
                      <Link to={`/profiles/${item.username}`}>
                        Open {item.displayName}&apos;s profile
                      </Link>
                    </h2>
                    <p>
                      <strong>Status:</strong> {status}
                    </p>
                    <p>
                      <strong>Evidence:</strong>{" "}
                      {item.evidenceCategory
                        ? item.evidenceCategory.replaceAll("_", " ")
                        : "No approved evidence category yet"}
                    </p>
                    {item.reviewDueAt && (
                      <p>
                        <strong>Review due:</strong>{" "}
                        {new Date(item.reviewDueAt).toLocaleDateString()}
                      </p>
                    )}
                    <p>
                      <strong>Latest note:</strong>{" "}
                      {item.decisionNote ||
                        "No reviewer note has been recorded."}
                    </p>
                  </div>

                  <Form method="post" className="admin-review-form">
                    <input type="hidden" name="userId" value={item.userId} />
                    <input type="hidden" name="role" value={item.role} />
                    <label>
                      Evidence category
                      <select
                        name="evidenceCategory"
                        defaultValue={
                          item.evidenceCategory ?? "identity_and_profile"
                        }
                      >
                        {evidenceCategories.map((category) => (
                          <option value={category} key={category}>
                            {category.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Review again after approval
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
                        defaultValue={item.decisionNote}
                        required
                      />
                    </label>
                    <p className="admin-scope-help">
                      <strong>Hold</strong> keeps the claim in this queue.
                      <strong> Reject</strong> declines a pending claim or
                      revokes an active badge.
                    </p>
                    <div className="button-row">
                      <button
                        className="button button-primary"
                        name="intent"
                        value="verify"
                        disabled={busy}
                      >
                        Approve
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="hold"
                        disabled={busy}
                      >
                        Hold
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value={rejectIntent}
                        disabled={busy}
                      >
                        Reject
                      </button>
                    </div>
                  </Form>
                </div>
              </details>
            );
          })}
        </section>
      </main>
    </div>
  );
}
