import { Form, Link } from "react-router";
import type { Route } from "./+types/admin-operations";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  cancelDelivery,
  retryDelivery,
  type DeliveryChannel,
  type DeliveryStatus,
} from "~/lib/delivery-outbox.server";
import { ensureDeliveryOperationsSchema } from "~/lib/delivery-operations-schema.server";
import { requireSuperAdmin } from "~/lib/membership.server";
import {
  operationsState,
  operationsStateMessage,
  totalOutstandingOperations,
  type OperationsCounts,
} from "~/lib/operations";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type AuditRow = {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  createdAt: string;
};

type DeliverySummary = {
  queued: number;
  processing: number;
  failed: number;
  deadLetter: number;
  oldestQueuedAt: string | null;
};

type DeliveryRow = {
  id: string;
  channel: DeliveryChannel;
  messageType: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  errorCategory: string | null;
  lastError: string | null;
  createdAt: string;
};

type ChannelHealth = {
  channel: DeliveryChannel;
  lastDeliveredAt: string | null;
};

type JobRunRow = {
  id: string;
  jobName: string;
  status: string;
  durationMs: number | null;
  errorCategory: string | null;
  lastError: string | null;
  startedAt: string;
  completedAt: string | null;
  cron: string;
  correlationId: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireSuperAdmin(request, env.DB);
  await ensureDeliveryOperationsSchema(env.DB);
  const [
    rawCounts,
    recentActivity,
    rawDeliverySummary,
    recentDeliveries,
    channelHealth,
    recentJobRuns,
  ] = await Promise.all([
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
    env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END) AS deadLetter,
         MIN(CASE WHEN status = 'queued' THEN created_at END) AS oldestQueuedAt
       FROM delivery_outbox`,
    ).first<DeliverySummary>(),
    env.DB.prepare(
      `SELECT id, channel, message_type AS messageType, status,
              attempt_count AS attemptCount, max_attempts AS maxAttempts,
              next_attempt_at AS nextAttemptAt,
              error_category AS errorCategory, last_error AS lastError,
              created_at AS createdAt
       FROM delivery_outbox
       WHERE status IN ('queued','processing','failed','dead_letter')
       ORDER BY CASE status
         WHEN 'dead_letter' THEN 0 WHEN 'failed' THEN 1
         WHEN 'processing' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT 30`,
    ).all<DeliveryRow>(),
    env.DB.prepare(
      `SELECT channel, MAX(delivered_at) AS lastDeliveredAt
       FROM delivery_outbox
       WHERE status = 'delivered'
       GROUP BY channel`,
    ).all<ChannelHealth>(),
    env.DB.prepare(
      `SELECT jobs.id, jobs.job_name AS jobName, jobs.status,
              jobs.duration_ms AS durationMs,
              jobs.error_category AS errorCategory,
              jobs.last_error AS lastError,
              jobs.started_at AS startedAt,
              jobs.completed_at AS completedAt,
              invocations.cron, invocations.correlation_id AS correlationId
       FROM scheduled_job_runs jobs
       JOIN scheduled_invocations invocations
         ON invocations.id = jobs.invocation_id
       ORDER BY jobs.started_at DESC
       LIMIT 20`,
    ).all<JobRunRow>(),
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
  const deliverySummary: DeliverySummary = rawDeliverySummary ?? {
    queued: 0,
    processing: 0,
    failed: 0,
    deadLetter: 0,
    oldestQueuedAt: null,
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
    { label: "Delivery outbox", ready: true },
    { label: "Scheduled job records", ready: true },
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
    deliverySummary,
    recentDeliveries: recentDeliveries.results,
    channelHealth: channelHealth.results,
    recentJobRuns: recentJobRuns.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  await ensureDeliveryOperationsSchema(db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const deliveryId = formText(form.get("deliveryId"));
  if (!deliveryId) return { error: "Delivery reference missing." };
  if (intent === "retry") {
    const changed = await retryDelivery(db, deliveryId, user.id);
    return changed
      ? { saved: "Delivery returned to the queue." }
      : { error: "Only failed or dead-letter deliveries can be retried." };
  }
  if (intent === "cancel") {
    const changed = await cancelDelivery(db, deliveryId, user.id);
    return changed
      ? { saved: "Delivery cancelled." }
      : { error: "That delivery can no longer be cancelled." };
  }
  throw new Response("Unsupported operation.", { status: 400 });
}

export default function AdminOperations({
  loaderData,
  actionData,
}: Route.ComponentProps) {
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
              Review queues, delivery failures, scheduled jobs and production
              configuration in one operational view.
            </p>
          </div>
          <Link className="button button-quiet" to="/app">
            Return to your House
          </Link>
        </header>

        {actionData?.saved && (
          <p className="notice success">{actionData.saved}</p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

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

        <section className="admin-panel" aria-labelledby="delivery-title">
          <span className="chapter">Delivery reliability</span>
          <h2 id="delivery-title">Outbox and dead letters</h2>
          <div className="member-home-stats" aria-label="Delivery status">
            <div>
              <strong>{loaderData.deliverySummary.queued}</strong>
              <span>Queued</span>
            </div>
            <div>
              <strong>{loaderData.deliverySummary.processing}</strong>
              <span>Processing</span>
            </div>
            <div>
              <strong>{loaderData.deliverySummary.failed}</strong>
              <span>Retrying</span>
            </div>
            <div>
              <strong>{loaderData.deliverySummary.deadLetter}</strong>
              <span>Dead letter</span>
            </div>
          </div>
          <p>
            <strong>Oldest queued:</strong>{" "}
            {loaderData.deliverySummary.oldestQueuedAt
              ? new Date(
                  loaderData.deliverySummary.oldestQueuedAt,
                ).toLocaleString()
              : "No queued deliveries"}
          </p>
          <div className="application-list">
            {loaderData.channelHealth.map((channel) => (
              <article className="status-card" key={channel.channel}>
                <span className="chapter">{channel.channel}</span>
                <h3>Last successful delivery</h3>
                <p>
                  {channel.lastDeliveredAt
                    ? new Date(channel.lastDeliveredAt).toLocaleString()
                    : "No successful delivery recorded"}
                </p>
              </article>
            ))}
          </div>
          <div className="application-list">
            {loaderData.recentDeliveries.map((delivery) => (
              <article className="application-card" key={delivery.id}>
                <div>
                  <span className="chapter">
                    {delivery.channel} · {delivery.status.replaceAll("_", " ")}
                  </span>
                  <h3>{delivery.messageType.replaceAll("_", " ")}</h3>
                  <p>
                    Attempt {delivery.attemptCount} of {delivery.maxAttempts}
                  </p>
                  {delivery.errorCategory && (
                    <p>
                      {delivery.errorCategory.replaceAll("_", " ")}:{" "}
                      {delivery.lastError || "No provider detail"}
                    </p>
                  )}
                  <p>
                    Next attempt:{" "}
                    {new Date(delivery.nextAttemptAt).toLocaleString()}
                  </p>
                </div>
                <Form method="post" className="button-row">
                  <input type="hidden" name="deliveryId" value={delivery.id} />
                  {(delivery.status === "failed" ||
                    delivery.status === "dead_letter") && (
                    <button
                      className="button button-primary"
                      name="intent"
                      value="retry"
                    >
                      Retry now
                    </button>
                  )}
                  {(delivery.status === "queued" ||
                    delivery.status === "failed" ||
                    delivery.status === "dead_letter") && (
                    <button
                      className="button button-quiet"
                      name="intent"
                      value="cancel"
                    >
                      Cancel
                    </button>
                  )}
                </Form>
              </article>
            ))}
            {!loaderData.recentDeliveries.length && (
              <section className="status-card">
                <h3>No delivery failures or queued messages.</h3>
              </section>
            )}
          </div>
        </section>

        <section className="admin-panel" aria-labelledby="scheduled-jobs-title">
          <span className="chapter">Scheduled execution</span>
          <h2 id="scheduled-jobs-title">Recent job runs</h2>
          <div className="application-list">
            {loaderData.recentJobRuns.map((run) => (
              <article className="application-card" key={run.id}>
                <div>
                  <span className="chapter">{run.status}</span>
                  <h3>{run.jobName.replaceAll("_", " ")}</h3>
                  <p>
                    Cron {run.cron} · {run.durationMs ?? 0} ms
                  </p>
                  {run.errorCategory && (
                    <p>
                      {run.errorCategory.replaceAll("_", " ")}: {run.lastError}
                    </p>
                  )}
                  <small>Correlation: {run.correlationId}</small>
                </div>
                <time dateTime={run.startedAt}>
                  {new Date(run.startedAt).toLocaleString()}
                </time>
              </article>
            ))}
            {!loaderData.recentJobRuns.length && (
              <section className="status-card">
                <h3>No scheduled executions have been recorded yet.</h3>
              </section>
            )}
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
                <span className="chapter">
                  {check.ready ? "Ready" : "Missing"}
                </span>
                <h3>{check.label}</h3>
              </article>
            ))}
          </div>
          <p>
            <strong>Application URL:</strong>{" "}
            {loaderData.appUrl || "Not configured"}
          </p>
          <a
            className="button button-quiet"
            href="/health"
            target="_blank"
            rel="noreferrer"
          >
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
            <h2 id="operations-activity-title">
              Recent administrative activity
            </h2>
          </header>
          <div className="application-list">
            {loaderData.recentActivity.map((item) => (
              <article className="application-card" key={item.id}>
                <div>
                  <span className="chapter">
                    {item.subjectType.replaceAll("_", " ")}
                  </span>
                  <h3>
                    {item.action.replaceAll(".", " · ").replaceAll("_", " ")}
                  </h3>
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
