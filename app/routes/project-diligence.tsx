import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-diligence";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";
import {
  isVerifiedInvestor,
  isVerifiedInvestorId,
  opportunityAccessStateForUserId,
  recordOpportunityAudit,
} from "~/lib/opportunity-access.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, title, founder_user_id AS founderUserId,
            COALESCE(data_room_url, '') AS dataRoomUrl
     FROM projects WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      founderUserId: string;
      dataRoomUrl: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const isFounder = project.founderUserId === user.id;
  const isInvestor = user.roles.includes("investor");
  if (!isFounder && !isInvestor)
    throw new Response("Founder or Investor access required.", { status: 403 });
  const opportunity = await db
    .prepare("SELECT status FROM opportunity_listings WHERE project_id = ?")
    .bind(project.id)
    .first<{ status: string }>();
  if (!isFounder && opportunity && !(await isVerifiedInvestor(db, user)))
    throw new Response("Diligence room not found.", { status: 404 });

  const documents = await db
    .prepare(
      `SELECT id, title, content_type AS contentType, byte_size AS byteSize,
            created_at AS createdAt
     FROM project_documents WHERE project_id = ? ORDER BY created_at DESC`,
    )
    .bind(project.id)
    .all<{
      id: string;
      title: string;
      contentType: string;
      byteSize: number;
      createdAt: string;
    }>();

  if (isFounder) {
    const [investors, grants, requests, logs] = await Promise.all([
      db
        .prepare(
          `SELECT u.id, u.username, p.display_name AS displayName
         FROM users u JOIN profiles p ON p.user_id = u.id
         JOIN role_verifications rv ON rv.user_id = u.id AND rv.role = 'investor'
         WHERE rv.status = 'verified' AND u.status = 'active'
         ORDER BY p.display_name LIMIT 200`,
        )
        .all<{ id: string; username: string; displayName: string }>(),
      db
        .prepare(
          `SELECT dag.id, dag.document_id AS documentId, pd.title AS documentTitle,
                dag.investor_user_id AS investorUserId, p.display_name AS investorName,
                u.username, dag.can_download AS canDownload,
                dag.expires_at AS expiresAt, dag.revoked_at AS revokedAt
         FROM document_access_grants dag
         JOIN project_documents pd ON pd.id = dag.document_id
         JOIN users u ON u.id = dag.investor_user_id
         JOIN profiles p ON p.user_id = u.id
         WHERE dag.project_id = ? ORDER BY dag.created_at DESC`,
        )
        .bind(project.id)
        .all<{
          id: string;
          documentId: string;
          documentTitle: string;
          investorUserId: string;
          investorName: string;
          username: string;
          canDownload: number;
          expiresAt: string;
          revokedAt: string | null;
        }>(),
      db
        .prepare(
          `SELECT drr.id, drr.reason, drr.status, drr.expires_at AS expiresAt,
                drr.created_at AS createdAt, u.username, p.display_name AS investorName
         FROM data_room_requests drr
         JOIN users u ON u.id = drr.investor_user_id
         JOIN profiles p ON p.user_id = u.id
         WHERE drr.project_id = ? ORDER BY drr.created_at DESC`,
        )
        .bind(project.id)
        .all<{
          id: string;
          reason: string;
          status: string;
          expiresAt: string | null;
          createdAt: string;
          username: string;
          investorName: string;
        }>(),
      db
        .prepare(
          `SELECT dal.action, dal.created_at AS createdAt, pd.title AS documentTitle,
                p.display_name AS memberName, u.username
         FROM document_access_logs dal
         JOIN project_documents pd ON pd.id = dal.document_id
         JOIN users u ON u.id = dal.user_id
         JOIN profiles p ON p.user_id = u.id
         WHERE dal.project_id = ? ORDER BY dal.created_at DESC LIMIT 100`,
        )
        .bind(project.id)
        .all<{
          action: string;
          createdAt: string;
          documentTitle: string;
          memberName: string;
          username: string;
        }>(),
    ]);
    return {
      user,
      project,
      isFounder,
      documents: documents.results,
      investors: investors.results,
      grants: grants.results,
      requests: requests.results,
      logs: logs.results,
      ownRequest: null,
    };
  }

  const [grants, ownRequest] = await Promise.all([
    db
      .prepare(
        `SELECT dag.id, dag.document_id AS documentId, pd.title AS documentTitle,
              dag.can_download AS canDownload, dag.expires_at AS expiresAt
       FROM document_access_grants dag
       JOIN project_documents pd ON pd.id = dag.document_id
       WHERE dag.project_id = ? AND dag.investor_user_id = ?
         AND dag.revoked_at IS NULL AND dag.starts_at <= datetime('now')
         AND dag.expires_at > datetime('now')
       ORDER BY pd.title`,
      )
      .bind(project.id, user.id)
      .all<{
        id: string;
        documentId: string;
        documentTitle: string;
        canDownload: number;
        expiresAt: string;
      }>(),
    db
      .prepare(
        `SELECT id, reason, status, expires_at AS expiresAt, created_at AS createdAt
       FROM data_room_requests WHERE project_id = ? AND investor_user_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(project.id, user.id)
      .first<{
        id: string;
        reason: string;
        status: string;
        expiresAt: string | null;
        createdAt: string;
      }>(),
  ]);
  return {
    user,
    project,
    isFounder,
    documents: [],
    investors: [],
    requests: [],
    logs: [],
    grants: grants.results,
    ownRequest,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  await ensureDiligenceSchema(db);
  const user = await requireApprovedMember(request, db);
  const project = await db
    .prepare(
      `SELECT id, slug, title, founder_user_id AS founderUserId,
            COALESCE(data_room_url, '') AS dataRoomUrl
     FROM projects WHERE slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      founderUserId: string;
      dataRoomUrl: string;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "request-data-room") {
    if (
      !user.roles.includes("investor") ||
      user.id === project.founderUserId ||
      !(await isVerifiedInvestor(db, user))
    )
      throw new Response("Verified Investor access required.", { status: 403 });
    const reason = formText(form.get("reason")).trim();
    if (reason.length < 20 || reason.length > 800)
      return { error: "Add a request reason between 20 and 800 characters." };
    await db.batch([
      db
        .prepare(
          `INSERT INTO data_room_requests (id, project_id, investor_user_id, reason)
         VALUES (?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        )
        .bind(crypto.randomUUID(), project.id, user.id, reason),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'diligence.request', 'New data-room request', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          project.founderUserId,
          `${user.displayName} requested diligence access for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'diligence.data_room_requested', 'project', ?)`,
        )
        .bind(crypto.randomUUID(), user.id, project.id),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?requested=1`);
  }

  if (user.id !== project.founderUserId)
    throw new Response("Project owner required.", { status: 403 });

  if (intent === "grant-document") {
    const documentId = formText(form.get("documentId"));
    const investorUserId = formText(form.get("investorUserId"));
    const days = Number(formText(form.get("days")));
    const canDownload = form.get("canDownload") === "yes" ? 1 : 0;
    if (!documentId || !investorUserId || ![7, 14, 30, 60, 90].includes(days))
      return {
        error: "Choose a document, verified Investor and access period.",
      };
    const valid = await db
      .prepare(
        `SELECT pd.approved_at AS approvedAt,
                ol.project_id AS opportunityProjectId
         FROM project_documents pd
         LEFT JOIN opportunity_listings ol ON ol.project_id = pd.project_id
         WHERE pd.id = ? AND pd.project_id = ?`,
      )
      .bind(documentId, project.id)
      .first<{
        approvedAt: string | null;
        opportunityProjectId: string | null;
      }>();
    if (!valid || !(await isVerifiedInvestorId(db, investorUserId)))
      throw new Response("Invalid diligence grant.", { status: 400 });
    if (valid.opportunityProjectId) {
      if (!valid.approvedAt)
        return {
          error: "AKARI must approve this document before it can be granted.",
        };
      if (
        (await opportunityAccessStateForUserId(
          db,
          project.id,
          investorUserId,
        )) !== "approved"
      )
        return {
          error:
            "Approve this Investor's Deal Room request before granting documents.",
        };
    }
    await db.batch([
      db
        .prepare(
          `UPDATE document_access_grants SET revoked_at = datetime('now'), revoked_by = ?,
         updated_at = datetime('now')
         WHERE project_id = ? AND document_id = ? AND investor_user_id = ? AND revoked_at IS NULL`,
        )
        .bind(user.id, project.id, documentId, investorUserId),
      db
        .prepare(
          `INSERT INTO document_access_grants
         (id, project_id, document_id, investor_user_id, granted_by, can_download, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`,
        )
        .bind(
          crypto.randomUUID(),
          project.id,
          documentId,
          investorUserId,
          user.id,
          canDownload,
          `+${days} days`,
        ),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'diligence.granted', 'Project document access granted', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          investorUserId,
          `You received time-limited diligence access for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'diligence.document_granted', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({
            documentId,
            investorUserId,
            days,
            canDownload: Boolean(canDownload),
          }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?granted=1`);
  }

  if (intent === "revoke-grant") {
    const grantId = formText(form.get("grantId"));
    await db.batch([
      db
        .prepare(
          `UPDATE document_access_grants SET revoked_at = datetime('now'), revoked_by = ?,
         updated_at = datetime('now') WHERE id = ? AND project_id = ? AND revoked_at IS NULL`,
        )
        .bind(user.id, grantId, project.id),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'diligence.document_revoked', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ grantId }),
        ),
    ]);
    throw redirect(`/projects/${project.slug}/diligence?revoked=1`);
  }

  if (intent === "approve-data-room" || intent === "decline-data-room") {
    const requestId = formText(form.get("requestId"));
    const note = formText(form.get("decisionNote")).trim();
    const days = Number(formText(form.get("days")) || "30");
    if (
      note.length < 5 ||
      note.length > 500 ||
      ![7, 14, 30, 60, 90].includes(days)
    )
      return { error: "Add a decision note and valid access period." };
    const target = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId FROM data_room_requests
       WHERE id = ? AND project_id = ? AND status = 'pending'`,
      )
      .bind(requestId, project.id)
      .first<{ investorUserId: string }>();
    if (!target) throw new Response("Request not found.", { status: 404 });
    const approved = intent === "approve-data-room";
    if (approved && !(await isVerifiedInvestorId(db, target.investorUserId)))
      return {
        error: "Only a currently verified Investor can receive access.",
      };
    await db.batch([
      db
        .prepare(
          `UPDATE data_room_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'),
         decision_note = ?, expires_at = CASE WHEN ? = 1 THEN datetime('now', ?) ELSE NULL END,
         updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(
          approved ? "approved" : "declined",
          user.id,
          note,
          approved ? 1 : 0,
          `+${days} days`,
          requestId,
        ),
      db
        .prepare(
          `INSERT INTO notifications (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'diligence.data_room_decision', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target.investorUserId,
          approved ? "Data-room access approved" : "Data-room request updated",
          approved
            ? `The founder approved time-limited data-room access for ${project.title}.`
            : `The founder declined the data-room request for ${project.title}.`,
          `/projects/${project.slug}/diligence`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'diligence.data_room_decided', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          project.id,
          JSON.stringify({ requestId, approved, days }),
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      approved ? "opportunity.access_approved" : "opportunity.access_declined",
      project.id,
      { requestId, days, decisionNote: note },
    );
    throw redirect(`/projects/${project.slug}/diligence?decision=1`);
  }

  if (intent === "revoke-data-room") {
    const requestId = formText(form.get("requestId"));
    const note = formText(form.get("decisionNote")).trim();
    if (note.length < 5 || note.length > 500)
      return { error: "Add a revocation note between 5 and 500 characters." };
    const target = await db
      .prepare(
        `SELECT investor_user_id AS investorUserId
         FROM data_room_requests
         WHERE id = ? AND project_id = ? AND status = 'approved'`,
      )
      .bind(requestId, project.id)
      .first<{ investorUserId: string }>();
    if (!target)
      throw new Response("Approved request not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE data_room_requests
           SET status = 'revoked', reviewed_by = ?, reviewed_at = datetime('now'),
               decision_note = ?, updated_at = datetime('now')
           WHERE id = ? AND project_id = ?`,
        )
        .bind(user.id, note, requestId, project.id),
      db
        .prepare(
          `UPDATE document_access_grants
           SET revoked_at = datetime('now'), revoked_by = ?,
               updated_at = datetime('now')
           WHERE project_id = ? AND investor_user_id = ?
             AND revoked_at IS NULL`,
        )
        .bind(user.id, project.id, target.investorUserId),
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'opportunity.access_revoked',
                   'Deal Room access revoked', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          target.investorUserId,
          `Access to ${project.title} was revoked. ${note}`,
          `/deals/${project.slug}`,
        ),
    ]);
    await recordOpportunityAudit(
      db,
      user.id,
      "opportunity.access_revoked",
      project.id,
      { requestId, investorUserId: target.investorUserId, decisionNote: note },
    );
    throw redirect(`/projects/${project.slug}/diligence?revoked=1`);
  }

  throw new Response("Unsupported diligence action.", { status: 400 });
}

export default function ProjectDiligence({
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
            <span className="eyebrow">Trusted diligence</span>
            <h1>{loaderData.project.title}</h1>
            <p>
              Permission-based project documents, data-room requests and access
              history.
            </p>
          </div>
          <Link
            className="button button-quiet"
            to={`/projects/${loaderData.project.slug}`}
          >
            Back to project
          </Link>
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        {loaderData.isFounder ? (
          <>
            <section className="admin-panel">
              <span className="chapter">Controlled document access</span>
              <h2>Grant a verified Investor temporary access</h2>
              {!loaderData.documents.length ? (
                <p>Upload documents in the project editor first.</p>
              ) : (
                <Form method="post" className="form-stack">
                  <label>
                    Document
                    <select name="documentId" required>
                      <option value="">Choose a document</option>
                      {loaderData.documents.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Verified Investor
                    <select name="investorUserId" required>
                      <option value="">Choose an Investor</option>
                      {loaderData.investors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.displayName} (@{item.username})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Access period
                    <select name="days" defaultValue="30">
                      {[7, 14, 30, 60, 90].map((days) => (
                        <option key={days} value={days}>
                          {days} days
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-choice">
                    <input
                      type="checkbox"
                      name="canDownload"
                      value="yes"
                      defaultChecked
                    />
                    Allow download
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="grant-document"
                    disabled={pending}
                  >
                    Grant access
                  </button>
                </Form>
              )}
            </section>

            <section>
              <h2>Document grants</h2>
              <div className="application-list">
                {loaderData.grants.map((grant) => (
                  <article className="application-card" key={grant.id}>
                    <div>
                      <span className="chapter">
                        {grant.revokedAt ? "revoked" : "active"}
                      </span>
                      <h3>{grant.documentTitle}</h3>
                      <p>
                        {grant.investorName} (@{grant.username})
                      </p>
                      <small>
                        Expires {new Date(grant.expiresAt).toLocaleString()}
                      </small>
                    </div>
                    {!grant.revokedAt && (
                      <Form method="post">
                        <input type="hidden" name="grantId" value={grant.id} />
                        <button
                          className="button button-quiet"
                          name="intent"
                          value="revoke-grant"
                          disabled={pending}
                        >
                          Revoke
                        </button>
                      </Form>
                    )}
                  </article>
                ))}
                {!loaderData.grants.length && <p>No document grants yet.</p>}
              </div>
            </section>

            <section>
              <h2>Data-room requests</h2>
              <div className="application-list">
                {loaderData.requests.map((item) => (
                  <article className="application-card" key={item.id}>
                    <div>
                      <span className="chapter">{item.status}</span>
                      <h3>
                        {item.investorName} (@{item.username})
                      </h3>
                      <p>{item.reason}</p>
                    </div>
                    {item.status === "pending" && (
                      <Form method="post" className="application-actions">
                        <input type="hidden" name="requestId" value={item.id} />
                        <label>
                          Decision note
                          <textarea
                            name="decisionNote"
                            minLength={5}
                            maxLength={500}
                            required
                          />
                        </label>
                        <label>
                          Access period
                          <select name="days" defaultValue="30">
                            {[7, 14, 30, 60, 90].map((days) => (
                              <option key={days} value={days}>
                                {days} days
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button button-primary"
                          name="intent"
                          value="approve-data-room"
                          disabled={pending}
                        >
                          Approve
                        </button>
                        <button
                          className="button button-quiet"
                          name="intent"
                          value="decline-data-room"
                          disabled={pending}
                        >
                          Decline
                        </button>
                      </Form>
                    )}
                  </article>
                ))}
                {!loaderData.requests.length && (
                  <p>No data-room requests yet.</p>
                )}
              </div>
            </section>

            <section>
              <h2>Recent document access</h2>
              <div className="application-list">
                {loaderData.logs.map((log, index) => (
                  <article
                    className="application-card"
                    key={`${log.createdAt}:${index}`}
                  >
                    <div>
                      <span className="chapter">{log.action}</span>
                      <h3>{log.documentTitle}</h3>
                      <p>
                        {log.memberName} (@{log.username})
                      </p>
                    </div>
                    <time>{new Date(log.createdAt).toLocaleString()}</time>
                  </article>
                ))}
                {!loaderData.logs.length && (
                  <p>No document access has been recorded.</p>
                )}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="admin-panel">
              <h2>Your granted documents</h2>
              <div className="application-list">
                {loaderData.grants.map((grant) => (
                  <article className="application-card" key={grant.id}>
                    <div>
                      <h3>{grant.documentTitle}</h3>
                      <small>
                        Access expires{" "}
                        {new Date(grant.expiresAt).toLocaleString()}
                      </small>
                    </div>
                    <a
                      className="button button-primary"
                      href={`/projects/${loaderData.project.slug}/documents/${grant.documentId}`}
                    >
                      {grant.canDownload ? "Download" : "Open"}
                    </a>
                  </article>
                ))}
                {!loaderData.grants.length && <p>No active document grants.</p>}
              </div>
            </section>
            <section className="admin-panel">
              <h2>Request external data-room access</h2>
              {loaderData.ownRequest &&
              ["pending", "approved"].includes(loaderData.ownRequest.status) ? (
                <p>
                  Your latest request is{" "}
                  <strong>{loaderData.ownRequest.status}</strong>
                  {loaderData.ownRequest.expiresAt
                    ? ` until ${new Date(loaderData.ownRequest.expiresAt).toLocaleString()}`
                    : ""}
                  .
                </p>
              ) : (
                <Form method="post" className="form-stack">
                  <label>
                    Why do you need access?
                    <textarea
                      name="reason"
                      minLength={20}
                      maxLength={800}
                      required
                    />
                  </label>
                  <button
                    className="button button-primary"
                    name="intent"
                    value="request-data-room"
                    disabled={pending}
                  >
                    Request data-room access
                  </button>
                </Form>
              )}
              {loaderData.ownRequest?.status === "approved" &&
                loaderData.project.dataRoomUrl && (
                  <a
                    className="button button-primary"
                    href={loaderData.project.dataRoomUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open approved data room
                  </a>
                )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
