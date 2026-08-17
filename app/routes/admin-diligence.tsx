import { Link } from "react-router";
import type { Route } from "./+types/admin-diligence";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  diligenceCategoryLabels,
  diligenceCompleteness,
} from "~/lib/diligence-completion";
import { requireSuperAdmin } from "~/lib/membership.server";

type DiligenceRow = {
  projectId: string;
  slug: string;
  title: string;
  founderName: string;
  founderUsername: string;
  tokenRelevant: number;
  ndaRequired: number;
  documentCategories: string;
  openQuestions: number;
  pendingRequests: number;
  activeGrants: number;
  opportunityStatus: string | null;
};

export const meta: Route.MetaFunction = () => [
  { title: "Diligence Operations | AKARI House" },
  {
    name: "description",
    content:
      "Internal review of Data Room completeness and diligence activity.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const rows = await db
    .prepare(
      `SELECT pr.id AS projectId, pr.slug, pr.title,
              COALESCE(p.display_name, u.username) AS founderName,
              u.username AS founderUsername,
              COALESCE(fp.token_relevant, 0) AS tokenRelevant,
              COALESCE(pds.nda_required, 0) AS ndaRequired,
              COALESCE((
                SELECT GROUP_CONCAT(pd.category, ' | ')
                FROM project_documents pd
                LEFT JOIN project_document_versions pdv ON pdv.document_id = pd.id
                WHERE pd.project_id = pr.id AND COALESCE(pdv.is_current, 1) = 1
              ), '') AS documentCategories,
              (SELECT COUNT(*) FROM opportunity_questions oq
                LEFT JOIN opportunity_question_documents oqd ON oqd.question_id = oq.id
                WHERE oq.project_id = pr.id AND oq.status IN ('submitted', 'answered')
                  AND oqd.resolved_at IS NULL) AS openQuestions,
              (SELECT COUNT(*) FROM data_room_requests drr
                WHERE drr.project_id = pr.id AND drr.status = 'pending') AS pendingRequests,
              (SELECT COUNT(*) FROM document_access_grants dag
                WHERE dag.project_id = pr.id AND dag.revoked_at IS NULL
                  AND dag.expires_at > datetime('now')) AS activeGrants,
              ol.status AS opportunityStatus
       FROM projects pr
       JOIN users u ON u.id = pr.founder_user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN project_fundraising_profiles fp ON fp.project_id = pr.id
       LEFT JOIN project_diligence_settings pds ON pds.project_id = pr.id
       LEFT JOIN opportunity_listings ol ON ol.project_id = pr.id
       WHERE fp.project_id IS NOT NULL OR ol.project_id IS NOT NULL
       ORDER BY openQuestions DESC, pendingRequests DESC, pr.updated_at DESC`,
    )
    .all<DiligenceRow>();
  return {
    user,
    access,
    rows: rows.results.map((row) => ({
      ...row,
      completeness: diligenceCompleteness(
        row.documentCategories ? row.documentCategories.split(" | ") : [],
        Boolean(row.tokenRelevant),
      ),
    })),
  };
}

export default function AdminDiligence({ loaderData }: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R72 · Diligence operations</span>
            <h1>Data Room readiness</h1>
            <p>
              One operational view of completeness, NDA policy, open diligence
              questions and active Investor access.
            </p>
          </div>
          <Link
            className="button button-quiet"
            to="/admin/opportunities/documents"
          >
            Document review
          </Link>
        </header>

        <div className="application-list">
          {loaderData.rows.map((row) => (
            <article className="application-card" key={row.projectId}>
              <div>
                <span className="chapter">
                  {row.completeness.percentage}% complete ·{" "}
                  {row.opportunityStatus ?? "no opportunity"}
                </span>
                <h2>{row.title}</h2>
                <p>
                  {row.founderName} (@{row.founderUsername}) · NDA{" "}
                  {row.ndaRequired ? "required" : "optional"}
                </p>
                <p>
                  Open diligence: {row.openQuestions} · Pending access:{" "}
                  {row.pendingRequests} · Active grants: {row.activeGrants}
                </p>
                {row.completeness.missing.length > 0 && (
                  <small>
                    Missing:{" "}
                    {row.completeness.missing
                      .map((category) => diligenceCategoryLabels[category])
                      .join(", ")}
                  </small>
                )}
              </div>
              <div className="application-actions">
                <Link
                  className="button button-primary"
                  to={`/projects/${row.slug}/diligence`}
                >
                  Open diligence
                </Link>
                <Link
                  className="button button-quiet"
                  to={`/projects/${row.slug}/diligence/access`}
                >
                  Access controls
                </Link>
              </div>
            </article>
          ))}
          {!loaderData.rows.length && (
            <p>
              No fundraising or Investor opportunity projects are active yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
