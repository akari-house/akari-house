import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-agreements";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import {
  agreementAttentionRank,
  agreementExpiryState,
  agreementNeedsFollowUp,
  agreementStatusLabels,
  agreementStatuses,
  agreementTypeLabels,
  agreementTypes,
  isAgreementStatus,
  isAgreementType,
  normalizeExternalAgreementUrl,
  type AgreementStatus,
  type AgreementType,
} from "~/lib/agreement-tracking";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeEmail, validateEmail } from "~/lib/validation";

type AgreementRow = {
  id: string;
  title: string;
  agreementType: AgreementType;
  status: AgreementStatus;
  counterpartyName: string;
  counterpartyEmail: string;
  projectId: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  campaignId: string | null;
  campaignSlug: string | null;
  campaignTitle: string | null;
  ownerUserId: string;
  ownerName: string;
  externalDocumentUrl: string;
  externalReference: string;
  requestedAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  nextFollowUpAt: string | null;
  note: string;
  updatedAt: string;
};

type OptionRow = { id: string; label: string; slug?: string };
type OwnerRow = { id: string; displayName: string; username: string };

function dateValue(value: FormDataEntryValue | null) {
  const date = formText(value).trim();
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function dateLabel(value: string | null) {
  if (!value) return "Not set";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(parsed)
    : value;
}

export const meta: Route.MetaFunction = () => [
  { title: "Agreement Tracking | AKARI House" },
  {
    name: "description",
    content:
      "Internal agreement lifecycle tracking and external legal references.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const url = new URL(request.url);
  const statusFilter = formText(url.searchParams.get("status"));
  const query = formText(url.searchParams.get("q")).trim().slice(0, 100);

  const [agreementResult, projectResult, campaignResult, ownerResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT ar.id, ar.title, ar.agreement_type AS agreementType,
                  ar.status, ar.counterparty_name AS counterpartyName,
                  ar.counterparty_email AS counterpartyEmail,
                  ar.project_id AS projectId, pr.slug AS projectSlug,
                  pr.title AS projectTitle,
                  ar.campaign_id AS campaignId, ac.slug AS campaignSlug,
                  ac.title AS campaignTitle,
                  ar.owner_user_id AS ownerUserId,
                  COALESCE(op.display_name, ou.username) AS ownerName,
                  ar.external_document_url AS externalDocumentUrl,
                  ar.external_reference AS externalReference,
                  ar.requested_at AS requestedAt, ar.sent_at AS sentAt,
                  ar.signed_at AS signedAt, ar.effective_at AS effectiveAt,
                  ar.expires_at AS expiresAt,
                  ar.next_follow_up_at AS nextFollowUpAt,
                  ar.note, ar.updated_at AS updatedAt
           FROM agreement_records ar
           LEFT JOIN projects pr ON pr.id = ar.project_id
           LEFT JOIN ambassador_campaigns ac ON ac.id = ar.campaign_id
           JOIN users ou ON ou.id = ar.owner_user_id
           LEFT JOIN profiles op ON op.user_id = ou.id
           WHERE (? = '' OR ar.status = ?)
             AND (? = '' OR ar.title LIKE '%' || ? || '%'
                  OR ar.counterparty_name LIKE '%' || ? || '%'
                  OR COALESCE(pr.title, '') LIKE '%' || ? || '%'
                  OR COALESCE(ac.title, '') LIKE '%' || ? || '%')
           ORDER BY ar.updated_at DESC`,
        )
        .bind(
          isAgreementStatus(statusFilter) ? statusFilter : "",
          isAgreementStatus(statusFilter) ? statusFilter : "",
          query,
          query,
          query,
          query,
          query,
        )
        .all<AgreementRow>(),
      db
        .prepare(
          `SELECT id, title AS label, slug
           FROM projects
           WHERE status NOT IN ('declined')
           ORDER BY updated_at DESC, title
           LIMIT 250`,
        )
        .all<OptionRow>(),
      db
        .prepare(
          `SELECT id, title AS label, slug
           FROM ambassador_campaigns
           ORDER BY updated_at DESC, title
           LIMIT 250`,
        )
        .all<OptionRow>(),
      db
        .prepare(
          `SELECT u.id, COALESCE(p.display_name, u.username) AS displayName,
                  u.username
           FROM admin_users au
           JOIN users u ON u.id = au.user_id AND u.status = 'active'
           LEFT JOIN profiles p ON p.user_id = u.id
           ORDER BY displayName, u.username`,
        )
        .all<OwnerRow>(),
    ]);

  const now = new Date();
  const agreements = agreementResult.results
    .map((record) => ({
      ...record,
      needsFollowUp: agreementNeedsFollowUp(
        record.status,
        record.nextFollowUpAt,
        now,
      ),
      expiryState: agreementExpiryState(record.status, record.expiresAt, now),
      attentionRank: agreementAttentionRank({
        status: record.status,
        nextFollowUpAt: record.nextFollowUpAt,
        expiresAt: record.expiresAt,
        now,
      }),
    }))
    .sort(
      (a, b) =>
        a.attentionRank - b.attentionRank ||
        b.updatedAt.localeCompare(a.updatedAt),
    );

  const summary = {
    total: agreements.length,
    followUp: agreements.filter((record) => record.needsFollowUp).length,
    awaitingSignature: agreements.filter((record) =>
      ["ready_to_send", "sent", "negotiation"].includes(record.status),
    ).length,
    signed: agreements.filter((record) => record.status === "signed").length,
    expiring: agreements.filter((record) => record.expiryState === "expiring")
      .length,
  };

  return {
    user,
    access,
    agreements,
    projects: projectResult.results,
    campaigns: campaignResult.results,
    owners: ownerResult.results,
    summary,
    statusFilter: isAgreementStatus(statusFilter) ? statusFilter : "",
    query,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (!new Set(["create", "update"]).has(intent))
    throw new Response("Unsupported agreement action.", { status: 400 });

  const agreementId = formText(form.get("agreementId")).trim();
  const title = formText(form.get("title")).trim();
  const agreementType = formText(form.get("agreementType"));
  const status = formText(form.get("status"));
  const counterpartyName = formText(form.get("counterpartyName")).trim();
  const counterpartyEmail = normalizeEmail(form.get("counterpartyEmail"));
  let projectId = formText(form.get("projectId")).trim() || null;
  const campaignId = formText(form.get("campaignId")).trim() || null;
  const ownerUserId = formText(form.get("ownerUserId")).trim();
  const externalDocumentUrl = normalizeExternalAgreementUrl(
    formText(form.get("externalDocumentUrl")),
  );
  const externalReference = formText(form.get("externalReference")).trim();
  const requestedAt = dateValue(form.get("requestedAt"));
  let sentAt = dateValue(form.get("sentAt"));
  let signedAt = dateValue(form.get("signedAt"));
  const effectiveAt = dateValue(form.get("effectiveAt"));
  const expiresAt = dateValue(form.get("expiresAt"));
  const nextFollowUpAt = dateValue(form.get("nextFollowUpAt"));
  const note = formText(form.get("note")).trim();

  if (intent === "update" && !agreementId)
    return { error: "Agreement reference is missing." };
  if (title.length < 3 || title.length > 160)
    return { error: "Agreement title must be between 3 and 160 characters." };
  if (!isAgreementType(agreementType) || !isAgreementStatus(status))
    return { error: "Choose a valid agreement type and stage." };
  if (counterpartyName.length < 2 || counterpartyName.length > 160)
    return { error: "Counterparty name must be between 2 and 160 characters." };
  if (counterpartyEmail && !validateEmail(counterpartyEmail))
    return { error: "Enter a valid counterparty email or leave it blank." };
  if (externalDocumentUrl === null)
    return { error: "External document links must use HTTPS." };
  if (externalReference.length > 300 || note.length > 3000)
    return { error: "Check the reference and note length limits." };
  if (
    [
      requestedAt,
      sentAt,
      signedAt,
      effectiveAt,
      expiresAt,
      nextFollowUpAt,
    ].some((value) => value === undefined)
  )
    return { error: "Use valid calendar dates." };
  if (effectiveAt && expiresAt && expiresAt < effectiveAt)
    return { error: "Expiry cannot be before the effective date." };
  if (status === "signed" && !externalDocumentUrl)
    return {
      error:
        "Add the external HTTPS document link before marking an agreement signed.",
    };

  const owner = await db
    .prepare(
      `SELECT au.user_id AS id
       FROM admin_users au
       JOIN users u ON u.id = au.user_id AND u.status = 'active'
       WHERE au.user_id = ?`,
    )
    .bind(ownerUserId)
    .first<{ id: string }>();
  if (!owner)
    return { error: "Choose an active AKARI admin as follow-up owner." };

  if (campaignId) {
    const campaign = await db
      .prepare(
        "SELECT project_id AS projectId FROM ambassador_campaigns WHERE id = ?",
      )
      .bind(campaignId)
      .first<{ projectId: string }>();
    if (!campaign) return { error: "The selected campaign no longer exists." };
    if (projectId && projectId !== campaign.projectId)
      return { error: "The selected campaign belongs to a different Project." };
    projectId = campaign.projectId;
  } else if (projectId) {
    const project = await db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .bind(projectId)
      .first();
    if (!project) return { error: "The selected Project no longer exists." };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (["sent", "negotiation", "signed"].includes(status) && !sentAt)
    sentAt = today;
  if (status === "signed" && !signedAt) signedAt = today;

  const id = intent === "create" ? crypto.randomUUID() : agreementId;
  const previous =
    intent === "update"
      ? await db
          .prepare(
            `SELECT status, external_document_url AS externalDocumentUrl,
                    expires_at AS expiresAt, next_follow_up_at AS nextFollowUpAt
             FROM agreement_records WHERE id = ?`,
          )
          .bind(id)
          .first<{
            status: string;
            externalDocumentUrl: string;
            expiresAt: string | null;
            nextFollowUpAt: string | null;
          }>()
      : null;
  if (intent === "update" && !previous)
    throw new Response("Agreement not found.", { status: 404 });

  const write =
    intent === "create"
      ? db
          .prepare(
            `INSERT INTO agreement_records
             (id, title, agreement_type, status, counterparty_name,
              counterparty_email, project_id, campaign_id, owner_user_id,
              external_document_url, external_reference, requested_at, sent_at,
              signed_at, effective_at, expires_at, next_follow_up_at, note,
              created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            title,
            agreementType,
            status,
            counterpartyName,
            counterpartyEmail,
            projectId,
            campaignId,
            owner.id,
            externalDocumentUrl,
            externalReference,
            requestedAt,
            sentAt,
            signedAt,
            effectiveAt,
            expiresAt,
            nextFollowUpAt,
            note,
            admin.id,
            admin.id,
          )
      : db
          .prepare(
            `UPDATE agreement_records
             SET title = ?, agreement_type = ?, status = ?,
                 counterparty_name = ?, counterparty_email = ?, project_id = ?,
                 campaign_id = ?, owner_user_id = ?, external_document_url = ?,
                 external_reference = ?, requested_at = ?, sent_at = ?,
                 signed_at = ?, effective_at = ?, expires_at = ?,
                 next_follow_up_at = ?, note = ?, updated_by = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(
            title,
            agreementType,
            status,
            counterpartyName,
            counterpartyEmail,
            projectId,
            campaignId,
            owner.id,
            externalDocumentUrl,
            externalReference,
            requestedAt,
            sentAt,
            signedAt,
            effectiveAt,
            expiresAt,
            nextFollowUpAt,
            note,
            admin.id,
            id,
          );

  await db.batch([
    write,
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, ?, 'agreement', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        intent === "create" ? "agreement.created" : "agreement.updated",
        id,
        JSON.stringify({
          agreementType,
          status,
          counterpartyName,
          projectId,
          campaignId,
          ownerUserId: owner.id,
          hasExternalDocument: Boolean(externalDocumentUrl),
          expiresAt,
          nextFollowUpAt,
          previous,
        }),
      ),
  ]);

  return {
    saved:
      intent === "create"
        ? "Agreement tracking record created."
        : "Agreement tracking record updated.",
  };
}

function AgreementForm({
  record,
  projects,
  campaigns,
  owners,
}: {
  record?: AgreementRow;
  projects: OptionRow[];
  campaigns: OptionRow[];
  owners: OwnerRow[];
}) {
  return (
    <Form method="post" className="profile-form agreement-tracking-form">
      <input type="hidden" name="intent" value={record ? "update" : "create"} />
      {record && <input type="hidden" name="agreementId" value={record.id} />}
      <div className="form-grid two-column-grid">
        <label>
          Agreement title
          <input
            name="title"
            minLength={3}
            maxLength={160}
            defaultValue={record?.title ?? ""}
            required
          />
        </label>
        <label>
          Agreement type
          <select
            name="agreementType"
            defaultValue={record?.agreementType ?? "service"}
          >
            {agreementTypes.map((type) => (
              <option value={type} key={type}>
                {agreementTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stage
          <select name="status" defaultValue={record?.status ?? "required"}>
            {agreementStatuses.map((status) => (
              <option value={status} key={status}>
                {agreementStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Follow-up owner
          <select
            name="ownerUserId"
            defaultValue={record?.ownerUserId ?? owners[0]?.id}
            required
          >
            {owners.map((owner) => (
              <option value={owner.id} key={owner.id}>
                {owner.displayName} (@{owner.username})
              </option>
            ))}
          </select>
        </label>
        <label>
          Counterparty
          <input
            name="counterpartyName"
            minLength={2}
            maxLength={160}
            defaultValue={record?.counterpartyName ?? ""}
            required
          />
        </label>
        <label>
          Counterparty email
          <input
            name="counterpartyEmail"
            type="email"
            maxLength={254}
            defaultValue={record?.counterpartyEmail ?? ""}
          />
        </label>
        <label>
          Related Project
          <select name="projectId" defaultValue={record?.projectId ?? ""}>
            <option value="">No Project link</option>
            {projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Related Campaign
          <select name="campaignId" defaultValue={record?.campaignId ?? ""}>
            <option value="">No Campaign link</option>
            {campaigns.map((campaign) => (
              <option value={campaign.id} key={campaign.id}>
                {campaign.label}
              </option>
            ))}
          </select>
        </label>
        <label className="full-span">
          External document link
          <input
            name="externalDocumentUrl"
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/..."
            defaultValue={record?.externalDocumentUrl ?? ""}
          />
          <small>
            HTTPS only. AKARI stores the reference, not the contract file.
          </small>
        </label>
        <label>
          External reference
          <input
            name="externalReference"
            maxLength={300}
            placeholder="Law firm / e-sign / internal reference"
            defaultValue={record?.externalReference ?? ""}
          />
        </label>
        <label>
          Requested
          <input
            name="requestedAt"
            type="date"
            defaultValue={record?.requestedAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Sent
          <input
            name="sentAt"
            type="date"
            defaultValue={record?.sentAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Signed externally
          <input
            name="signedAt"
            type="date"
            defaultValue={record?.signedAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Effective
          <input
            name="effectiveAt"
            type="date"
            defaultValue={record?.effectiveAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Expires
          <input
            name="expiresAt"
            type="date"
            defaultValue={record?.expiresAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label>
          Next follow-up
          <input
            name="nextFollowUpAt"
            type="date"
            defaultValue={record?.nextFollowUpAt?.slice(0, 10) ?? ""}
          />
        </label>
        <label className="full-span">
          Operational note
          <textarea
            name="note"
            rows={3}
            maxLength={3000}
            defaultValue={record?.note ?? ""}
          />
        </label>
      </div>
      <button className="button button-primary" type="submit">
        {record ? "Update tracking record" : "Create tracking record"}
      </button>
    </Form>
  );
}

export default function AdminAgreements({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main admin-agreements-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R70 legal reference operations</span>
            <h1>Agreement tracking</h1>
            <p>
              Track who needs an agreement, where the external original lives,
              its current stage, expiry and the AKARI owner responsible for
              follow-up.
            </p>
          </div>
          <Link className="button button-quiet" to="/admin">
            Admin workspace
          </Link>
        </header>
        <AdminWorkspaceNav access={loaderData.access} />

        <section
          className="notice applicant-notice"
          aria-label="Legal boundary"
        >
          <strong>Operational tracking only.</strong>
          <p>
            AKARI does not generate, draft, review or sign agreements. Lawyers
            and external providers remain the source of the legal document and
            signature.
          </p>
        </section>

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

        <section
          className="application-queue-summary"
          aria-label="Agreement summary"
        >
          <span>
            <strong>{loaderData.summary.followUp}</strong> follow-ups due
          </span>
          <span>
            <strong>{loaderData.summary.awaitingSignature}</strong> awaiting
            signature
          </span>
          <span>
            <strong>{loaderData.summary.signed}</strong> signed
          </span>
          <span>
            <strong>{loaderData.summary.expiring}</strong> expiring in 30 days
          </span>
        </section>

        <section className="status-card" aria-labelledby="new-agreement-title">
          <span className="chapter">New record</span>
          <h2 id="new-agreement-title">
            Record an external agreement requirement.
          </h2>
          <AgreementForm
            projects={loaderData.projects}
            campaigns={loaderData.campaigns}
            owners={loaderData.owners}
          />
        </section>

        <section aria-labelledby="agreement-register-title">
          <div className="admin-heading compact-heading">
            <div>
              <span className="chapter">Register</span>
              <h2 id="agreement-register-title">Agreement operations</h2>
            </div>
            <Form method="get" className="admin-filter-form">
              <label>
                Search
                <input
                  name="q"
                  defaultValue={loaderData.query}
                  placeholder="Counterparty or Project"
                />
              </label>
              <label>
                Stage
                <select name="status" defaultValue={loaderData.statusFilter}>
                  <option value="">All stages</option>
                  {agreementStatuses.map((status) => (
                    <option value={status} key={status}>
                      {agreementStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button-quiet" type="submit">
                Filter
              </button>
              {searchParams.size > 0 && (
                <Link to="/admin/agreements">Clear</Link>
              )}
            </Form>
          </div>

          <div className="application-list">
            {loaderData.agreements.length ? (
              loaderData.agreements.map((record) => (
                <details
                  className="application-card agreement-card"
                  key={record.id}
                >
                  <summary>
                    <div>
                      <span className="chapter">
                        {agreementStatusLabels[record.status]} ·{" "}
                        {agreementTypeLabels[record.agreementType]}
                      </span>
                      <h3>{record.title}</h3>
                      <p>
                        {record.counterpartyName} · Owner: {record.ownerName}
                      </p>
                    </div>
                    <div className="agreement-status-stack">
                      {record.needsFollowUp && (
                        <span className="status-pill">Follow-up due</span>
                      )}
                      {record.expiryState === "expiring" && (
                        <span className="status-pill">Expiring soon</span>
                      )}
                      {record.expiryState === "expired" && (
                        <span className="status-pill">Expired</span>
                      )}
                    </div>
                  </summary>
                  <div className="agreement-record-details">
                    <p>
                      <strong>Project:</strong>{" "}
                      {record.projectSlug ? (
                        <Link to={`/projects/${record.projectSlug}`}>
                          {record.projectTitle}
                        </Link>
                      ) : (
                        "Not linked"
                      )}
                      <br />
                      <strong>Campaign:</strong>{" "}
                      {record.campaignSlug ? (
                        <Link to={`/campaigns/${record.campaignSlug}`}>
                          {record.campaignTitle}
                        </Link>
                      ) : (
                        "Not linked"
                      )}
                      <br />
                      <strong>Next follow-up:</strong>{" "}
                      {dateLabel(record.nextFollowUpAt)}
                      <br />
                      <strong>Expiry:</strong> {dateLabel(record.expiresAt)}
                    </p>
                    {record.externalDocumentUrl ? (
                      <p>
                        <a
                          href={record.externalDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open external agreement ↗
                        </a>
                      </p>
                    ) : (
                      <p className="chapter">
                        External document not linked yet
                      </p>
                    )}
                    <AgreementForm
                      record={record}
                      projects={loaderData.projects}
                      campaigns={loaderData.campaigns}
                      owners={loaderData.owners}
                    />
                  </div>
                </details>
              ))
            ) : (
              <p className="empty-state">
                No agreement records match this view.
              </p>
            )}
          </div>
        </section>
        {pending && (
          <span className="sr-only" aria-live="polite">
            Saving agreement tracking changes.
          </span>
        )}
      </main>
    </div>
  );
}
