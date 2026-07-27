import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-opportunities";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdmin, requireAdminScope } from "~/lib/membership.server";
import { recordOpportunityAudit } from "~/lib/opportunity-access.server";
import { publishSubmittedOpportunitySections } from "~/lib/opportunity-sections.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type ListingReviewRow = {
  projectId: string;
  slug: string;
  title: string;
  founderName: string;
  sector: string;
  geography: string;
  fundingInstrument: string;
  publicSummary: string;
  riskSummary: string;
  status: string;
  submittedAt: string | null;
  decisionNote: string;
};

type InvestorReviewRow = {
  userId: string;
  username: string;
  displayName: string;
  status: string;
  sectorsJson: string;
  stagesJson: string;
  geographiesJson: string;
  eligibilityNote: string;
  updatedAt: string;
  decisionNote: string;
};

type AdminPermissionRow = {
  accessLevel: "admin" | "superadmin";
  scopes: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdmin(request, db);
  const permission = await db
    .prepare(
      `SELECT au.access_level AS accessLevel,
              group_concat(s.scope, ',') AS scopes
       FROM admin_users au
       LEFT JOIN admin_scopes s ON s.admin_user_id = au.user_id
       WHERE au.user_id = ?
       GROUP BY au.user_id`,
    )
    .bind(user.id)
    .first<AdminPermissionRow>();
  const scopeSet = new Set(permission?.scopes?.split(",") ?? []);
  const canReviewProjects =
    permission?.accessLevel === "superadmin" || scopeSet.has("projects");
  const canReviewInvestors =
    permission?.accessLevel === "superadmin" || scopeSet.has("verification");
  if (!canReviewProjects && !canReviewInvestors)
    throw new Response("Admin permission required.", { status: 403 });

  const [listings, investors] = await Promise.all([
    canReviewProjects
      ? db
          .prepare(
            `SELECT pr.id AS projectId, pr.slug, pr.title,
                    p.display_name AS founderName,
                    ol.sector, ol.geography,
                    ol.funding_instrument AS fundingInstrument,
                    ol.public_summary AS publicSummary,
                    ol.risk_summary AS riskSummary,
                    ol.status, ol.submitted_at AS submittedAt,
                    ol.decision_note AS decisionNote
             FROM opportunity_listings ol
             JOIN projects pr ON pr.id = ol.project_id
             JOIN profiles p ON p.user_id = pr.founder_user_id
             WHERE ol.status IN ('submitted', 'published', 'paused', 'declined')
             ORDER BY CASE ol.status WHEN 'submitted' THEN 0 ELSE 1 END,
                      COALESCE(ol.submitted_at, ol.updated_at)`,
          )
          .all<ListingReviewRow>()
      : Promise.resolve({ results: [] as ListingReviewRow[] }),
    canReviewInvestors
      ? db
          .prepare(
            `SELECT ip.user_id AS userId, u.username,
                    p.display_name AS displayName, ip.status,
                    ip.sectors_json AS sectorsJson,
                    ip.stages_json AS stagesJson,
                    ip.geographies_json AS geographiesJson,
                    ip.eligibility_note AS eligibilityNote,
                    ip.updated_at AS updatedAt,
                    ip.decision_note AS decisionNote
             FROM investor_profiles ip
             JOIN users u ON u.id = ip.user_id
             JOIN profiles p ON p.user_id = ip.user_id
             WHERE ip.status IN (
               'verification_pending', 'verified', 'restricted', 'rejected'
             )
             ORDER BY CASE ip.status WHEN 'verification_pending' THEN 0 ELSE 1 END,
                      ip.updated_at`,
          )
          .all<InvestorReviewRow>()
      : Promise.resolve({ results: [] as InvestorReviewRow[] }),
  ]);

  return {
    user,
    canReviewProjects,
    canReviewInvestors,
    listings: listings.results,
    investors: investors.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (decisionNote.length < 5 || decisionNote.length > 1000)
    return { error: "Add a decision note between 5 and 1,000 characters." };

  if (["publish", "decline", "pause", "archive"].includes(intent)) {
    const admin = await requireAdminScope(request, db, "projects");
    const projectId = formText(form.get("projectId"));
    const listing = await db
      .prepare(
        `SELECT ol.status, pr.status AS projectStatus,
                pr.founder_user_id AS founderUserId, pr.title, pr.slug
         FROM opportunity_listings ol
         JOIN projects pr ON pr.id = ol.project_id
         WHERE ol.project_id = ?`,
      )
      .bind(projectId)
      .first<{
        status: string;
        projectStatus: string;
        founderUserId: string;
        title: string;
        slug: string;
      }>();
    if (!listing) throw new Response("Opportunity not found.", { status: 404 });
    if (intent === "publish" && listing.projectStatus !== "published")
      return {
        error: "Publish the underlying project before its opportunity.",
      };
    const nextStatus =
      intent === "publish"
        ? "published"
        : intent === "decline"
          ? "declined"
          : intent === "pause"
            ? "paused"
            : "archived";
    await db.batch([
      db
        .prepare(
          `UPDATE opportunity_listings
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE project_id = ?`,
        )
        .bind(nextStatus, admin.id, decisionNote, projectId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.review', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          listing.founderUserId,
          `Opportunity review: ${nextStatus}`,
          `${listing.title} is now ${nextStatus}. ${decisionNote}`,
          nextStatus === "published"
            ? `/deals/${listing.slug}`
            : `/projects/${listing.slug}/opportunity`,
        ),
    ]);
    if (nextStatus === "published")
      await publishSubmittedOpportunitySections(
        db,
        projectId,
        admin.id,
        decisionNote,
      );
    await recordOpportunityAudit(
      db,
      admin.id,
      `opportunity.${nextStatus}`,
      projectId,
      { decisionNote },
    );
    return { saved: `Opportunity marked ${nextStatus}.` };
  }

  if (
    ["verify-investor", "restrict-investor", "reject-investor"].includes(intent)
  ) {
    const admin = await requireAdminScope(request, db, "verification");
    const userId = formText(form.get("userId"));
    const evidenceCategory = formText(form.get("evidenceCategory"));
    const reviewMonths = Number(formText(form.get("reviewMonths")) || "12");
    const nextStatus =
      intent === "verify-investor"
        ? "verified"
        : intent === "restrict-investor"
          ? "restricted"
          : "rejected";
    if (
      intent === "verify-investor" &&
      (![
        "identity_and_profile",
        "investment_activity",
        "professional_references",
      ].includes(evidenceCategory) ||
        ![3, 6, 12, 24].includes(reviewMonths))
    )
      return { error: "Choose valid evidence and a scheduled review period." };
    const target = await db
      .prepare(
        `SELECT u.id, u.status AS accountStatus
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'investor'
         JOIN membership_applications ma
           ON ma.user_id = u.id AND ma.status = 'approved'
         WHERE u.id = ?`,
      )
      .bind(userId)
      .first<{ id: string; accountStatus: string }>();
    if (!target) throw new Response("Investor not found.", { status: 404 });
    if (intent === "verify-investor" && target.accountStatus !== "active")
      return { error: "Only active approved members can be verified." };

    const roleStatus = nextStatus === "verified" ? "verified" : "revoked";
    const statements = [
      db
        .prepare(
          `UPDATE investor_profiles
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE user_id = ?`,
        )
        .bind(nextStatus, admin.id, decisionNote, userId),
      db
        .prepare(
          `UPDATE role_verifications
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE user_id = ? AND role = 'investor'`,
        )
        .bind(roleStatus, admin.id, decisionNote, userId),
      db
        .prepare(
          `UPDATE verification_provenance
           SET status = 'revoked', updated_at = datetime('now')
           WHERE user_id = ? AND role = 'investor' AND status = 'active'`,
        )
        .bind(userId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'investor.verification', ?, ?, '/settings/investor')`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          `Investor review: ${nextStatus}`,
          nextStatus === "verified"
            ? `Your Investor profile has been verified until its next scheduled review. ${decisionNote}`
            : `Your Investor profile is ${nextStatus}. ${decisionNote}`,
        ),
    ];
    if (nextStatus === "verified")
      statements.splice(
        3,
        0,
        db
          .prepare(
            `INSERT INTO verification_provenance
             (id, user_id, role, evidence_category, verified_by,
              review_due_at, note)
             VALUES (?, ?, 'investor', ?, ?, datetime('now', ?), ?)`,
          )
          .bind(
            crypto.randomUUID(),
            userId,
            evidenceCategory,
            admin.id,
            `+${reviewMonths} months`,
            decisionNote,
          ),
      );
    await db.batch(statements);
    await recordOpportunityAudit(
      db,
      admin.id,
      `investor.${nextStatus}`,
      userId,
      { decisionNote, evidenceCategory, reviewMonths },
    );
    return { saved: `Investor marked ${nextStatus}.` };
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function AdminOpportunities({
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
            <span className="eyebrow">Curated opportunity operations</span>
            <h1>Review listings and Investor eligibility.</h1>
            <p>
              Publication and verification are separate decisions. Neither can
              be bypassed by selecting a role or changing a URL.
            </p>
          </div>
          <div className="deal-action-row">
            <Link
              className="button button-primary"
              to="/admin/opportunities/operations"
            >
              Deal Room operations
            </Link>
            <Link className="button button-quiet" to="/admin/operations">
              Operations centre
            </Link>
          </div>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.saved}
          </p>
        )}

        {loaderData.canReviewProjects && (
          <section aria-labelledby="opportunity-review-title">
            <span className="chapter">Opportunity review</span>
            <h2 id="opportunity-review-title">Founder submissions</h2>
            <div className="application-list">
              {loaderData.listings.length ? (
                loaderData.listings.map((listing) => (
                  <article className="application-card" key={listing.projectId}>
                    <div>
                      <span className="chapter">
                        {listing.status} · {listing.sector}
                      </span>
                      <h3>{listing.title}</h3>
                      <p>Founder: {listing.founderName}</p>
                      <p>{listing.publicSummary}</p>
                      <p>
                        <strong>Geography:</strong> {listing.geography}
                        <br />
                        <strong>Instrument:</strong>{" "}
                        {listing.fundingInstrument.replaceAll("_", " ")}
                      </p>
                      <aside className="deal-risk-note">
                        <strong>Submitted risk information</strong>
                        <p>{listing.riskSummary}</p>
                      </aside>
                      <Link to={`/projects/${listing.slug}`}>
                        Review project
                      </Link>
                    </div>
                    <Form method="post" className="application-actions">
                      <input
                        type="hidden"
                        name="projectId"
                        value={listing.projectId}
                      />
                      <label>
                        Decision note
                        <textarea
                          name="decisionNote"
                          minLength={5}
                          maxLength={1000}
                          required
                        />
                      </label>
                      <button
                        className="button button-primary"
                        name="intent"
                        value="publish"
                        disabled={navigation.state !== "idle"}
                      >
                        Publish approved preview
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="decline"
                      >
                        Decline
                      </button>
                      {listing.status === "published" && (
                        <button
                          className="button button-quiet"
                          name="intent"
                          value="pause"
                        >
                          Pause access
                        </button>
                      )}
                      <button
                        className="text-button"
                        name="intent"
                        value="archive"
                      >
                        Archive
                      </button>
                    </Form>
                  </article>
                ))
              ) : (
                <p className="empty-state">
                  No opportunity submissions need review.
                </p>
              )}
            </div>
          </section>
        )}

        {loaderData.canReviewInvestors && (
          <section aria-labelledby="investor-review-title">
            <span className="chapter">Investor eligibility</span>
            <h2 id="investor-review-title">Profiles requiring evidence</h2>
            <div className="application-list">
              {loaderData.investors.length ? (
                loaderData.investors.map((investor) => (
                  <article className="application-card" key={investor.userId}>
                    <div>
                      <span className="chapter">{investor.status}</span>
                      <h3>
                        <Link to={`/profiles/${investor.username}`}>
                          {investor.displayName}
                        </Link>
                      </h3>
                      <p>@{investor.username}</p>
                      <p>{investor.eligibilityNote}</p>
                      <p>
                        <strong>Sectors:</strong>{" "}
                        {(JSON.parse(investor.sectorsJson) as string[]).join(
                          ", ",
                        )}
                        <br />
                        <strong>Stages:</strong>{" "}
                        {(JSON.parse(investor.stagesJson) as string[]).join(
                          ", ",
                        )}
                        <br />
                        <strong>Geographies:</strong>{" "}
                        {(
                          JSON.parse(investor.geographiesJson) as string[]
                        ).join(", ")}
                      </p>
                    </div>
                    <Form method="post" className="application-actions">
                      <input
                        type="hidden"
                        name="userId"
                        value={investor.userId}
                      />
                      <label>
                        Evidence category
                        <select
                          name="evidenceCategory"
                          defaultValue="investment_activity"
                        >
                          <option value="identity_and_profile">
                            Identity and profile
                          </option>
                          <option value="investment_activity">
                            Investment activity
                          </option>
                          <option value="professional_references">
                            Professional references
                          </option>
                        </select>
                      </label>
                      <label>
                        Review again after
                        <select name="reviewMonths" defaultValue="12">
                          {[3, 6, 12, 24].map((months) => (
                            <option key={months} value={months}>
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
                          maxLength={1000}
                          required
                        />
                      </label>
                      <button
                        className="button button-primary"
                        name="intent"
                        value="verify-investor"
                        disabled={navigation.state !== "idle"}
                      >
                        Verify Investor
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="restrict-investor"
                      >
                        Restrict
                      </button>
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="reject-investor"
                      >
                        Reject
                      </button>
                    </Form>
                  </article>
                ))
              ) : (
                <p className="empty-state">No Investor profiles need review.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
