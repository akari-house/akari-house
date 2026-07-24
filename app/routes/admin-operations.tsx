import { Link } from "react-router";
import type { Route } from "./+types/admin-operations";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import {
  operationsState,
  operationsStateMessage,
  totalOutstandingOperations,
  type OperationsCounts,
} from "~/lib/operations";

type AuditRow = {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  createdAt: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  const [rawCounts, recentActivity] = await Promise.all([
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM membership_applications
          WHERE status IN ('pending_email', 'pending_review', 'waitlisted'))
          AS membershipApplications,
        (SELECT COUNT(*) FROM role_verifications WHERE status = 'pending')
          AS roleVerifications,
        (SELECT COUNT(*) FROM projects WHERE status = 'submitted') AS projects,
        (SELECT COUNT(*) FROM interest_requests WHERE status = 'pending')
          AS interests,
        (SELECT COUNT(*) FROM events WHERE status = 'submitted') AS events,
        (SELECT COUNT(*) FROM ambassador_campaigns WHERE status = 'submitted')
          AS campaigns,
        (SELECT COUNT(*) FROM moderation_reports
          WHERE status IN ('open', 'reviewing')) AS moderationReports,
        (SELECT COUNT(*) FROM contact_messages
          WHERE status IN ('open', 'reviewing')) AS contactMessages`,
    ).first<OperationsCounts>(),
    env.DB.prepare(
      `SELECT id, action, subject_type AS subjectType,
              subject_id AS subjectId, created_at AS createdAt
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 12`,
    ).all<AuditRow>(),
  ]);

  const counts: OperationsCounts = rawCounts ?? {
    membershipApplications: 0,
    roleVerifications: 0,
    projects: 0,
    interests: 0,
    events: 0,
    campaigns: 0,
    moderationReports: 0,
    contactMessages: 0,
  };
  const state = operationsState(counts);
  const checks = [
    { label: "D1 database", ready: true },
    { label: "R2 private media", ready: Boolean(env.MEDIA) },
    {
      label: "Transactional email",
      ready: Boolean(env.RESEND_API_KEY && env.MEMBERSHIP_FROM_EMAIL),
    },
    {
      label: "Turnstile protection",
      ready: Boolean(
        env.TURNSTILE_SITE_KEY &&
          env.TURNSTILE_SECRET_KEY &&
          env.TURNSTILE_HOSTNAME,
      ),
    },
    {
      label: "Google campaign export",
      ready: Boolean(
        env.GOOGLE_CLIENT_ID &&
          env.GOOGLE_CLIENT_SECRET &&
          env.GOOGLE_TOKEN_ENCRYPTION_KEY,
      ),
    },
  ];

  return {
    user,
    counts,
    state,
    outstanding: totalOutstandingOperations(counts),
    stateMessage: operationsStateMessage(state),
    checks,
    allServicesReady: checks.every((check) => check.ready),
    appUrl: env.APP_URL,
    recentActivity: recentActivity.results,
  };
}

export default function AdminOperations({ loaderData }: Route.ComponentProps) {
  const queues = [
    {
      label: "Membership",
      value: loaderData.counts.membershipApplications,
      to: "/admin/applications",
    },
    {
      label: "Role verification",
      value: loaderData.counts.roleVerifications,
      to: "/admin/verifications",
    },
    {
      label: "Projects",
      value: loaderData.counts.projects,
      to: "/admin/interests",
    },
    {
      label: "Member interests",
      value: loaderData.counts.interests,
      to: "/admin/interests",
    },
    {
      label: "Events",
      value: loaderData.counts.events,
      to: "/admin/interests",
    },
    {
      label: "Campaign review",
      value: loaderData.counts.campaigns,
      to: "/admin/campaigns",
    },
    {
      label: "Moderation",
      value: loaderData.counts.moderationReports,
      to: "/admin/moderation",
    },
    {
      label: "Contact desk",
      value: loaderData.counts.contactMessages,
      to: "/admin/contact",
    },
  ];
  const noticeClass =
    loaderData.state === "clear" ? "notice success" : "notice applicant-notice";

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Launch operations</span>
            <h1>AKARI command centre</h1>
            <p>
              One view of review queues, production configuration and recent
              administrative activity.
            </p>
          </div>
          <Link className="button button-quiet" to="/app">
            Return to your House
          </Link>
        </header>

        <section className={noticeClass} aria-live="polite">
          <strong>
            {loaderData.outstanding} operational item
            {loaderData.outstanding === 1 ? "" : "s"} waiting
          </strong>
          <p>{loaderData.stateMessage}</p>
        </section>

        <section aria-labelledby="operations-queues-title">
          <header>
            <span className="chapter">Review queues</span>
            <h2 id="operations-queues-title">What needs attention</h2>
          </header>
          <div className="member-home-stats" aria-label="Operational queues">
            {queues.map((queue) => (
              <Link key={queue.label} to={queue.to}>
                <strong>{queue.value}</strong>
                <span>{queue.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="service-health-title">
          <span className="chapter">Production readiness</span>
          <h2 id="service-health-title">Service health</h2>
          <p>
            Configuration is checked without exposing secret values. The public
            health endpoint remains available for deployment smoke tests.
          </p>
          <div className="application-list">
            {loaderData.checks.map((check) => (
              <article className="status-card" key={check.label}>
                <span className="chapter">{check.ready ? "Ready" : "Missing"}</span>
                <h3>{check.label}</h3>
              </article>
            ))}
          </div>
          <p>
            <strong>Application URL:</strong> {loaderData.appUrl || "Not configured"}
          </p>
          <a className="button button-quiet" href="/health" target="_blank" rel="noreferrer">
            Open live health check
          </a>
          {!loaderData.allServicesReady && (
            <p className="form-error" role="alert">
              One or more required production integrations are incomplete.
            </p>
          )}
        </section>

        <section aria-labelledby="operations-activity-title">
          <header>
            <span className="chapter">Audit trail</span>
            <h2 id="operations-activity-title">Recent administrative activity</h2>
          </header>
          <div className="application-list">
            {loaderData.recentActivity.map((item) => (
              <article className="application-card" key={item.id}>
                <div>
                  <span className="chapter">
                    {item.subjectType.replaceAll("_", " ")}
                  </span>
                  <h3>{item.action.replaceAll(".", " · ").replaceAll("_", " ")}</h3>
                  {item.subjectId && <p>Reference: {item.subjectId}</p>}
                </div>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </article>
            ))}
            {!loaderData.recentActivity.length && (
              <section className="status-card">
                <h3>No administrative activity has been recorded yet.</h3>
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
