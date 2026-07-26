import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-opportunity-documents";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { recordOpportunityAudit } from "~/lib/opportunity-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type DocumentReviewRow = {
  documentId: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  founderUserId: string;
  founderName: string;
  title: string;
  contentType: string;
  byteSize: number;
  category: string;
  visibility: string;
  approvedAt: string | null;
  createdAt: string;
  listingStatus: string;
  activeGrants: number;
};

const categories = [
  "company",
  "product",
  "financial",
  "legal",
  "tokenomics",
  "traction",
  "team",
  "risk",
  "other",
] as const;

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "projects");
  const documents = await db
    .prepare(
      `SELECT pd.id AS documentId, pd.project_id AS projectId,
              pr.slug AS projectSlug, pr.title AS projectTitle,
              pr.founder_user_id AS founderUserId,
              fp.display_name AS founderName,
              pd.title, pd.content_type AS contentType,
              pd.byte_size AS byteSize, pd.category, pd.visibility,
              pd.approved_at AS approvedAt, pd.created_at AS createdAt,
              ol.status AS listingStatus,
              COUNT(CASE
                WHEN dag.revoked_at IS NULL
                 AND dag.starts_at <= datetime('now')
                 AND dag.expires_at > datetime('now')
                THEN 1 END) AS activeGrants
       FROM project_documents pd
       JOIN projects pr ON pr.id = pd.project_id
       JOIN profiles fp ON fp.user_id = pr.founder_user_id
       JOIN opportunity_listings ol ON ol.project_id = pr.id
       LEFT JOIN document_access_grants dag ON dag.document_id = pd.id
       WHERE ol.status IN ('submitted', 'published', 'paused')
       GROUP BY pd.id
       ORDER BY CASE WHEN pd.approved_at IS NULL THEN 0 ELSE 1 END,
                pd.created_at DESC`,
    )
    .all<DocumentReviewRow>();
  return { user, documents: documents.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "projects");
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const documentId = formText(form.get("documentId"));
  const category = formText(form.get("category"));
  const visibility = formText(form.get("visibility"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (!new Set(["approve-document", "withdraw-document"]).has(intent))
    throw new Response("Unsupported document review action.", { status: 400 });
  if (decisionNote.length < 5 || decisionNote.length > 1000)
    return { error: "Add a decision note between 5 and 1,000 characters." };
  if (
    intent === "approve-document" &&
    (!categories.includes(category as (typeof categories)[number]) ||
      !new Set(["confidential", "restricted"]).has(visibility))
  )
    return { error: "Choose a valid document category and access class." };

  const document = await db
    .prepare(
      `SELECT pd.id, pd.project_id AS projectId, pd.title,
              pr.slug AS projectSlug, pr.title AS projectTitle,
              pr.founder_user_id AS founderUserId,
              ol.status AS listingStatus
       FROM project_documents pd
       JOIN projects pr ON pr.id = pd.project_id
       JOIN opportunity_listings ol ON ol.project_id = pr.id
       WHERE pd.id = ?
         AND ol.status IN ('submitted', 'published', 'paused')`,
    )
    .bind(documentId)
    .first<{
      id: string;
      projectId: string;
      title: string;
      projectSlug: string;
      projectTitle: string;
      founderUserId: string;
      listingStatus: string;
    }>();
  if (!document) throw new Response("Document not found.", { status: 404 });

  if (intent === "approve-document") {
    await db.batch([
      db
        .prepare(
          `UPDATE project_documents
           SET category = ?, visibility = ?, approved_at = datetime('now'),
               approved_by = ?
           WHERE id = ? AND project_id = ?`,
        )
        .bind(category, visibility, admin.id, document.id, document.projectId),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.document_review',
                   'Private document approved', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          document.founderUserId,
          `${document.title} was approved for controlled use in ${document.projectTitle}. ${decisionNote}`,
          `/projects/${document.projectSlug}/diligence`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      admin.id,
      "opportunity.document_approved",
      document.projectId,
      {
        documentId: document.id,
        category,
        visibility,
        decisionNote,
      },
    );
    return { saved: "Document approved for controlled room access." };
  }

  await db.batch([
    db
      .prepare(
        `UPDATE project_documents
         SET approved_at = NULL, approved_by = NULL
         WHERE id = ? AND project_id = ?`,
      )
      .bind(document.id, document.projectId),
    db
      .prepare(
        `UPDATE document_access_grants
         SET revoked_at = datetime('now'), revoked_by = ?,
             updated_at = datetime('now')
         WHERE document_id = ? AND project_id = ? AND revoked_at IS NULL`,
      )
      .bind(admin.id, document.id, document.projectId),
    db
      .prepare(
        `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'opportunity.document_review',
                 'Private document approval withdrawn', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        document.founderUserId,
        `${document.title} is no longer approved for private-room access. Existing grants were revoked. ${decisionNote}`,
        `/projects/${document.projectSlug}/diligence`,
      ),
  ]);
  await recordOpportunityAudit(
    db,
    admin.id,
    "opportunity.document_approval_withdrawn",
    document.projectId,
    { documentId: document.id, decisionNote },
  );
  return { saved: "Document approval withdrawn and active grants revoked." };
}

export default function AdminOpportunityDocuments({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Private document review</span>
            <h1>Approve what can enter a private room.</h1>
            <p>
              Founder uploads remain private by default. An approved opportunity
              does not automatically approve every document added to it.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin/opportunities">
            Opportunity review
          </Link>
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

        <section aria-labelledby="document-review-title">
          <span className="chapter">Document queue</span>
          <h2 id="document-review-title">Uploaded private material</h2>
          <div className="application-list">
            {loaderData.documents.length ? (
              loaderData.documents.map((document) => (
                <article className="application-card" key={document.documentId}>
                  <div>
                    <span className="chapter">
                      {document.approvedAt ? "approved" : "pending review"} ·{" "}
                      {document.listingStatus}
                    </span>
                    <h3>{document.title}</h3>
                    <p>
                      <Link to={`/deals/${document.projectSlug}`}>
                        {document.projectTitle}
                      </Link>
                      <br />
                      Founder: {document.founderName}
                    </p>
                    <p>
                      <strong>File:</strong> {document.contentType} ·{" "}
                      {sizeLabel(document.byteSize)}
                      <br />
                      <strong>Class:</strong> {document.category} ·{" "}
                      {document.visibility}
                      <br />
                      <strong>Active grants:</strong> {document.activeGrants}
                    </p>
                    {document.approvedAt && (
                      <small>
                        Approved{" "}
                        {new Date(document.approvedAt).toLocaleString()}
                      </small>
                    )}
                  </div>
                  <Form method="post" className="application-actions">
                    <input
                      type="hidden"
                      name="documentId"
                      value={document.documentId}
                    />
                    <label>
                      Category
                      <select name="category" defaultValue={document.category}>
                        {categories.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Access class
                      <select
                        name="visibility"
                        defaultValue={document.visibility}
                      >
                        <option value="confidential">Confidential</option>
                        <option value="restricted">Restricted</option>
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
                      value="approve-document"
                      disabled={pending}
                    >
                      {document.approvedAt
                        ? "Update approval"
                        : "Approve document"}
                    </button>
                    {document.approvedAt && (
                      <button
                        className="button button-quiet"
                        name="intent"
                        value="withdraw-document"
                        disabled={pending}
                      >
                        Withdraw approval
                      </button>
                    )}
                  </Form>
                </article>
              ))
            ) : (
              <p className="empty-state">
                No private opportunity documents are awaiting review.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
