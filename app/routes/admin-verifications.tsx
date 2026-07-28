import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-verifications";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type VerificationRole = "founder" | "creator" | "investor";
type VerificationView = "queue" | "history";

type VerificationRow = {
  userId: string;
  username: string;
  displayName: string;
  role: VerificationRole;
  status: string;
  updatedAt: string;
  reviewedAt: string | null;
  decisionNote: string;
  evidenceCategory: string | null;
  reviewDueAt: string | null;
};

const roles = ["founder", "creator", "investor"] as const;
const evidenceCategories = [
  "identity_and_profile",
  "company_or_project",
  "creator_channels",
  "investment_activity",
  "professional_references",
] as const;
const defaultEvidenceByRole: Record<VerificationRole, (typeof evidenceCategories)[number]> = {
  founder: "company_or_project",
  creator: "creator_channels",
  investor: "investment_activity",
};
const PAGE_SIZE = 50;

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

function titleCase(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
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

  const url = new URL(request.url);
  const view: VerificationView =
    url.searchParams.get("view") === "history" ? "history" : "queue";
  const requestedRole = url.searchParams.get("role");
  const roleFilter = roles.includes(requestedRole as VerificationRole)
    ? (requestedRole as VerificationRole)
    : "all";
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );

  const statusClause =
    view === "queue"
      ? "rv.status = 'pending'"
      : "rv.status IN ('verified', 'declined', 'revoked')";
  const roleClause = roleFilter === "all" ? "" : " AND rv.role = ?";
  const bindings = roleFilter === "all" ? [] : [roleFilter];

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM role_verifications rv
       JOIN users u ON u.id = rv.user_id
       JOIN profiles p ON p.user_id = rv.user_id
       WHERE ${statusClause}${roleClause}`,
    )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const orderClause =
    view === "queue"
      ? "CASE WHEN rv.reviewed_at IS NULL THEN 0 ELSE 1 END, rv.updated_at DESC"
      : "rv.updated_at DESC";

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
       WHERE ${statusClause}${roleClause}
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, PAGE_SIZE, offset)
    .all<VerificationRow>();

  return {
    user,
    verifications: verifications.results,
    view,
    roleFilter,
    page: currentPage,
    total,
    totalPages,
    pageSize: PAGE_SIZE,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const admin = await requireAdminScope(request, db, "verification");
  const form = await request.formData();
  const userId = formText(form.get("userId"));
  const role = formText(form.get("role")) as VerificationRole;
  const intent = formText(form.get("intent"));
  const suppliedNote = formText(form.get("decisionNote")).trim();
  const suppliedEvidence = formText(form.get("evidenceCategory"));
  const reviewMonths = Number(formText(form.get("reviewMonths")) || "12");

  const defaultDecisionNote =
    intent === "verify"
      ? `Approved ${role} role from the verification queue.`
      : intent === "hold"
        ? `Held ${role} claim for further review.`
        : `Rejected ${role} claim from the verification queue.`;
  const decisionNote = suppliedNote || defaultDecisionNote;
  const evidenceCategory =
    suppliedEvidence || defaultEvidenceByRole[role] || "identity_and_profile";

  if (
    !roles.includes(role) ||
    !["verify", "hold", "decline"].includes(intent) ||
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
        "Choose a valid claim, decision, evidence category and review period.",
    };

  const status =
    intent === "verify" ? "verified" : intent === "hold" ? "pending" : "declined";
  const statements = [
    db
      .prepare(
        `UPDATE role_verifications SET status = ?, reviewed_by = ?,
         reviewed_at = datetime('now'), decision_note = ?,
         updated_at = datetime('now')
         WHERE user_id = ? AND role = ? AND status = 'pending'`,
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
        `${titleCase(role)} verification updated`,
        status === "verified"
          ? `Your ${role} role has been approved until its scheduled review.`
          : intent === "hold"
            ? `Your ${role} claim is on hold while it receives further review.`
            : `Your ${role} claim was not approved. You can update your profile before requesting another review.`,
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
      1,
      0,
      db
        .prepare(
          `UPDATE verification_provenance SET status = 'revoked',
           updated_at = datetime('now')
           WHERE user_id = ? AND role = ? AND status = 'active'`,
        )
        .bind(userId, role),
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

function queueHref(
  view: VerificationView,
  role: VerificationRole | "all",
  page = 1,
) {
  const params = new URLSearchParams({ view });
  if (role !== "all") params.set("role", role);
  if (page > 1) params.set("page", String(page));
  return `/admin/verifications?${params.toString()}`;
}

export default function AdminVerifications({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const firstResult =
    loaderData.total === 0
      ? 0
      : (loaderData.page - 1) * loaderData.pageSize + 1;
  const lastResult = Math.min(
    loaderData.total,
    loaderData.page * loaderData.pageSize,
  );

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Identity and role review</span>
            <h1>Verification approval centre</h1>
            <p>
              A fast review queue for role claims. Approved and rejected claims
              leave this queue immediately and remain available in history.
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
            Verification decision saved.
          </p>
        )}

        <div className="admin-queue-toolbar">
          <nav className="admin-filter-tabs" aria-label="Verification view">
            <Link
              to={queueHref("queue", loaderData.roleFilter)}
              aria-current={loaderData.view === "queue" ? "page" : undefined}
            >
              Active queue
            </Link>
            <Link
              to={queueHref("history", loaderData.roleFilter)}
              aria-current={loaderData.view === "history" ? "page" : undefined}
            >
              Reviewed history
            </Link>
          </nav>
          <p className="member-directory-summary" aria-live="polite">
            {loaderData.total === 0 ? (
              "No claims"
            ) : (
              <>
                <strong>{firstResult}</strong>–<strong>{lastResult}</strong> of{" "}
                <strong>{loaderData.total}</strong>
              </>
            )}
          </p>
        </div>

        <nav className="verification-role-filters" aria-label="Filter by role">
          <Link
            to={queueHref(loaderData.view, "all")}
            aria-current={loaderData.roleFilter === "all" ? "page" : undefined}
          >
            All roles
          </Link>
          {roles.map((role) => (
            <Link
              key={role}
              to={queueHref(loaderData.view, role)}
              aria-current={loaderData.roleFilter === role ? "page" : undefined}
            >
              {titleCase(role)}
            </Link>
          ))}
        </nav>

        {loaderData.verifications.length === 0 ? (
          <section className="verification-empty-state">
            <span className="chapter">
              {loaderData.view === "queue" ? "Queue clear" : "No history yet"}
            </span>
            <h2>
              {loaderData.view === "queue"
                ? "There are no role claims waiting for review."
                : "No reviewed claims match this filter."}
            </h2>
          </section>
        ) : (
          <section className="verification-list" aria-label="Verification claims">
            <div className="verification-list-head" aria-hidden="true">
              <span>Member</span>
              <span>Claim</span>
              <span>Status</span>
              <span>{loaderData.view === "queue" ? "Decision" : "Reviewed"}</span>
            </div>
            {loaderData.verifications.map((item) => {
              const status = displayStatus(item);
              return (
                <article
                  className="verification-row"
                  key={`${item.userId}:${item.role}`}
                >
                  <div className="verification-person">
                    <strong>
                      <Link to={`/profiles/${item.username}`}>
                        {item.displayName}
                      </Link>
                    </strong>
                    <span>@{item.username}</span>
                  </div>
                  <div className="verification-claim">
                    <strong>Claims {titleCase(item.role)}</strong>
                    <span>{item.decisionNote || "Awaiting administrator review"}</span>
                  </div>
                  <div className="verification-state">
                    <strong>{titleCase(status)}</strong>
                    <span>
                      {item.evidenceCategory
                        ? item.evidenceCategory.replaceAll("_", " ")
                        : item.reviewedAt
                          ? `Updated ${new Date(item.updatedAt).toLocaleDateString()}`
                          : "New claim"}
                    </span>
                  </div>

                  {loaderData.view === "queue" ? (
                    <Form method="post" className="verification-actions">
                      <input type="hidden" name="userId" value={item.userId} />
                      <input type="hidden" name="role" value={item.role} />
                      <input
                        type="hidden"
                        name="evidenceCategory"
                        value={defaultEvidenceByRole[item.role]}
                      />
                      <input type="hidden" name="reviewMonths" value="12" />
                      <button
                        className="button button-primary"
                        name="intent"
                        value="verify"
                        disabled={busy}
                        title={`Approve ${item.displayName} as ${item.role}`}
                      >
                        Approve
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="hold"
                        disabled={busy}
                        title={`Hold ${item.displayName}'s ${item.role} claim`}
                      >
                        Hold
                      </button>
                      <button
                        className="button button-quiet verification-reject"
                        name="intent"
                        value="decline"
                        disabled={busy}
                        title={`Reject ${item.displayName}'s ${item.role} claim`}
                      >
                        Reject
                      </button>
                    </Form>
                  ) : (
                    <time
                      className="verification-reviewed-at"
                      dateTime={item.reviewedAt ?? item.updatedAt}
                    >
                      {new Date(
                        item.reviewedAt ?? item.updatedAt,
                      ).toLocaleDateString()}
                    </time>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {loaderData.totalPages > 1 && (
          <nav className="verification-pagination" aria-label="Verification pages">
            {loaderData.page > 1 && (
              <Link
                className="button button-quiet"
                to={queueHref(
                  loaderData.view,
                  loaderData.roleFilter,
                  loaderData.page - 1,
                )}
              >
                Previous
              </Link>
            )}
            <span>
              Page {loaderData.page} of {loaderData.totalPages}
            </span>
            {loaderData.page < loaderData.totalPages && (
              <Link
                className="button button-quiet"
                to={queueHref(
                  loaderData.view,
                  loaderData.roleFilter,
                  loaderData.page + 1,
                )}
              >
                Next
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
