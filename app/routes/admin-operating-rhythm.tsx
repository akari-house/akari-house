import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-operating-rhythm";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import {
  attentionSeverities,
  attentionSourceLabels,
  attentionSourceTypes,
  isAttentionStatus,
  isOperatingReportType,
  operatingReportLabels,
  operatingReportTypes,
  summarizeAttention,
  type ActiveAttentionSignal,
  type AttentionSeverity,
  type AttentionSourceType,
  type OperatingReportType,
} from "~/lib/operating-rhythm";
import {
  createOperatingReport,
  loadActiveAttention,
  loadAttentionSignals,
} from "~/lib/operating-rhythm.server";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type OwnerOption = { id: string; displayName: string; username: string };
type ProjectOption = { id: string; title: string; slug: string };
type ReportRow = {
  id: string;
  reportType: OperatingReportType;
  projectId: string | null;
  projectTitle: string | null;
  periodStart: string;
  periodEnd: string;
  generationSource: string;
  snapshotJson: string;
  createdAt: string;
};

type ReportSummary = {
  total?: number;
  severity?: Partial<Record<AttentionSeverity, number>>;
};

function isSourceType(value: string): value is AttentionSourceType {
  return attentionSourceTypes.includes(value as AttentionSourceType);
}

function safeDateInput(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59Z` : undefined;
}

function dateLabel(value: string | null) {
  if (!value) return "No deadline";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function reportSummary(snapshotJson: string): ReportSummary {
  try {
    const parsed = JSON.parse(snapshotJson) as { summary?: ReportSummary };
    return parsed.summary ?? {};
  } catch {
    return {};
  }
}

export const meta: Route.MetaFunction = () => [
  { title: "Operating Rhythm | AKARI House" },
  {
    name: "description",
    content:
      "Internal attention signals, follow-up ownership and recurring operating reports.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const url = new URL(request.url);
  const severityFilter = formText(url.searchParams.get("severity"));
  const sourceFilter = formText(url.searchParams.get("source"));
  const ownerFilter = formText(url.searchParams.get("owner"));

  const [active, owners, projects, reports] = await Promise.all([
    loadActiveAttention(db),
    db
      .prepare(
        `SELECT u.id, u.username, COALESCE(p.display_name, u.username) AS displayName
         FROM admin_users au
         JOIN users u ON u.id = au.user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         WHERE u.status = 'active'
         ORDER BY displayName COLLATE NOCASE`,
      )
      .all<OwnerOption>(),
    db
      .prepare(
        `SELECT id, title, slug FROM projects
         WHERE status <> 'archived'
         ORDER BY title COLLATE NOCASE`,
      )
      .all<ProjectOption>(),
    db
      .prepare(
        `SELECT rr.id, rr.report_type AS reportType, rr.project_id AS projectId,
                p.title AS projectTitle, rr.period_start AS periodStart,
                rr.period_end AS periodEnd,
                rr.generation_source AS generationSource,
                rr.snapshot_json AS snapshotJson, rr.created_at AS createdAt
         FROM operating_report_runs rr
         LEFT JOIN projects p ON p.id = rr.project_id
         ORDER BY rr.created_at DESC LIMIT 30`,
      )
      .all<ReportRow>(),
  ]);

  const filtered = active.filter((item) => {
    if (
      attentionSeverities.includes(severityFilter as AttentionSeverity) &&
      item.severity !== severityFilter
    )
      return false;
    if (isSourceType(sourceFilter) && item.sourceType !== sourceFilter)
      return false;
    if (ownerFilter && item.assignedTo !== ownerFilter) return false;
    return true;
  });

  return {
    user,
    access,
    items: filtered,
    summary: summarizeAttention(active),
    filteredSummary: summarizeAttention(filtered),
    owners: owners.results,
    projects: projects.results,
    reports: reports.results.map((report) => ({
      ...report,
      summary: reportSummary(report.snapshotJson),
    })),
    filters: {
      severity: severityFilter,
      source: sourceFilter,
      owner: ownerFilter,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "update-attention") {
    const key = formText(form.get("attentionKey")).trim();
    const status = formText(form.get("status"));
    const assignedTo = formText(form.get("assignedTo")).trim() || null;
    const snoozedUntil = safeDateInput(form.get("snoozedUntil"));
    const note = formText(form.get("note")).trim().slice(0, 2000);
    if (!key || !isAttentionStatus(status) || snoozedUntil === undefined) {
      return { error: "Check the attention workflow fields." };
    }
    if (status === "snoozed" && !snoozedUntil) {
      return { error: "Choose a snooze-until date." };
    }
    if (assignedTo) {
      const admin = await db
        .prepare("SELECT 1 FROM admin_users WHERE user_id = ?")
        .bind(assignedTo)
        .first();
      if (!admin) return { error: "Attention owner must be an AKARI admin." };
    }
    const source = (await loadAttentionSignals(db)).find(
      (item) => item.attentionKey === key,
    );
    if (!source)
      throw new Response("Attention item not found.", { status: 404 });

    await db.batch([
      db
        .prepare(
          `INSERT INTO attention_item_states
           (attention_key, source_type, source_id, status, assigned_to,
            snoozed_until, note, resolved_at, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?,
                   CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END,
                   ?, datetime('now'))
           ON CONFLICT(attention_key) DO UPDATE SET
             status = excluded.status,
             assigned_to = excluded.assigned_to,
             snoozed_until = excluded.snoozed_until,
             note = excluded.note,
             resolved_at = excluded.resolved_at,
             updated_by = excluded.updated_by,
             updated_at = datetime('now')`,
        )
        .bind(
          key,
          source.sourceType,
          source.sourceId,
          status,
          assignedTo,
          status === "snoozed" ? snoozedUntil : null,
          note,
          status,
          user.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'operating_attention.updated', 'attention_item', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          key,
          JSON.stringify({ status, assignedTo, snoozedUntil }),
        ),
    ]);
    return { saved: true, message: "Attention workflow updated." };
  }

  if (intent === "generate-report") {
    const reportType = formText(form.get("reportType"));
    const projectId = formText(form.get("projectId")).trim() || null;
    if (!isOperatingReportType(reportType)) {
      return { error: "Choose a supported operating report." };
    }
    if (reportType === "founder_weekly" && !projectId) {
      return { error: "Founder weekly reports require a project." };
    }
    if (projectId) {
      const project = await db
        .prepare("SELECT 1 FROM projects WHERE id = ?")
        .bind(projectId)
        .first();
      if (!project) throw new Response("Project not found.", { status: 404 });
    }
    await createOperatingReport(db, {
      reportType,
      projectId: reportType === "founder_weekly" ? projectId : null,
      createdBy: user.id,
      generationSource: "manual",
    });
    await db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'operating_report.generated', 'operating_report', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        reportType,
        JSON.stringify({ reportType, projectId }),
      )
      .run();
    return { saved: true, message: "Operating report snapshot generated." };
  }

  return { error: "Unsupported operating-rhythm action." };
}

function SeverityBadge({ severity }: { severity: AttentionSeverity }) {
  return <span className={`status-pill status-${severity}`}>{severity}</span>;
}

export default function AdminOperatingRhythm({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Operating rhythm</span>
            <h1>What needs AKARI attention now.</h1>
            <p>
              One internal view across relationship follow-ups, agreements,
              diligence, fundraising, campaigns and review SLAs.
            </p>
          </div>
        </header>

        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.message}
          </p>
        )}

        <section className="admin-stat-grid" aria-label="Attention summary">
          <article className="status-card">
            <span className="chapter">Open attention</span>
            <strong>{loaderData.summary.total}</strong>
          </article>
          <article className="status-card">
            <span className="chapter">Overdue</span>
            <strong>{loaderData.summary.severity.overdue}</strong>
          </article>
          <article className="status-card">
            <span className="chapter">Due today</span>
            <strong>{loaderData.summary.severity.today}</strong>
          </article>
          <article className="status-card">
            <span className="chapter">Due soon</span>
            <strong>{loaderData.summary.severity.soon}</strong>
          </article>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Filter</span>
              <h2>Attention queue</h2>
            </div>
          </div>
          <Form method="get" className="form-row">
            <label>
              Severity
              <select
                name="severity"
                defaultValue={loaderData.filters.severity}
              >
                <option value="">All</option>
                {attentionSeverities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select name="source" defaultValue={loaderData.filters.source}>
                <option value="">All</option>
                {attentionSourceTypes.map((value) => (
                  <option key={value} value={value}>
                    {attentionSourceLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Owner
              <select name="owner" defaultValue={loaderData.filters.owner}>
                <option value="">All</option>
                {loaderData.owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-quiet">Apply filters</button>
          </Form>
          <p className="muted">
            Showing {loaderData.filteredSummary.total} active item
            {loaderData.filteredSummary.total === 1 ? "" : "s"}.
          </p>
        </section>

        <div className="notification-list" aria-busy={pending}>
          {loaderData.items.length ? (
            loaderData.items.map((item: ActiveAttentionSignal) => (
              <article
                key={item.attentionKey}
                id={`attention-${item.attentionKey.replaceAll(":", "-")}`}
              >
                <div>
                  <div className="form-row">
                    <span className="chapter">
                      {attentionSourceLabels[item.sourceType]}
                    </span>
                    <SeverityBadge severity={item.severity} />
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                  <p className="muted">Due: {dateLabel(item.dueAt)}</p>
                  <Link className="text-link" to={item.actionUrl}>
                    Open source record
                  </Link>
                </div>
                <Form method="post" className="profile-form">
                  <input type="hidden" name="intent" value="update-attention" />
                  <input
                    type="hidden"
                    name="attentionKey"
                    value={item.attentionKey}
                  />
                  <label>
                    Status
                    <select name="status" defaultValue={item.stateStatus}>
                      <option value="open">Open</option>
                      <option value="snoozed">Snoozed</option>
                      <option value="resolved">Resolved</option>
                      <option value="ignored">Ignore</option>
                    </select>
                  </label>
                  <label>
                    Owner
                    <select
                      name="assignedTo"
                      defaultValue={item.assignedTo ?? ""}
                    >
                      <option value="">
                        Use source owner / Superadmin queue
                      </option>
                      {loaderData.owners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Snooze until
                    <input type="date" name="snoozedUntil" />
                  </label>
                  <label>
                    Internal workflow note
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={2000}
                      defaultValue={item.stateNote}
                    />
                  </label>
                  <button className="button button-quiet" disabled={pending}>
                    {pending ? "Saving..." : "Update"}
                  </button>
                </Form>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h2>No matching attention items.</h2>
              <p>The selected operating queue is clear.</p>
            </div>
          )}
        </div>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Reports</span>
              <h2>Generate an operating snapshot</h2>
            </div>
          </div>
          <p>
            Snapshots preserve the operating state for the selected week. They
            reference canonical records rather than becoming a second CRM.
          </p>
          <Form method="post" className="form-row">
            <input type="hidden" name="intent" value="generate-report" />
            <label>
              Report type
              <select name="reportType" defaultValue="management_weekly">
                {operatingReportTypes.map((value) => (
                  <option key={value} value={value}>
                    {operatingReportLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project for Founder weekly
              <select name="projectId" defaultValue="">
                <option value="">Not project-scoped</option>
                {loaderData.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="button button-primary" disabled={pending}>
              {pending ? "Generating..." : "Generate snapshot"}
            </button>
          </Form>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">History</span>
              <h2>Recent operating reports</h2>
            </div>
          </div>
          {loaderData.reports.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Project</th>
                    <th>Period</th>
                    <th>Items</th>
                    <th>Overdue</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {loaderData.reports.map((report) => (
                    <tr key={report.id}>
                      <td>{operatingReportLabels[report.reportType]}</td>
                      <td>{report.projectTitle ?? "All AKARI"}</td>
                      <td>
                        {report.periodStart} to {report.periodEnd}
                      </td>
                      <td>{report.summary.total ?? 0}</td>
                      <td>{report.summary.severity?.overdue ?? 0}</td>
                      <td>{report.generationSource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No operating report snapshots yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
