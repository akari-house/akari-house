import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/admin-launch-completion";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  evaluateLaunchCompletion,
  pilotTaskDefinitions,
  type PilotTaskKey,
} from "~/lib/launch-completion";
import { requireSuperAdmin } from "~/lib/membership.server";
import { ensureProductionPilotSchema } from "~/lib/production-pilot-schema.server";
import { assertSameOrigin } from "~/lib/security.server";

type CountRow = { count: number };
type CohortRow = {
  id: string;
  name: string;
  status: "planning" | "active" | "paused" | "completed";
  stage: string;
  targetSize: number;
};
type EligibleUserRow = {
  id: string;
  username: string;
  displayName: string;
  roles: string;
};
type ParticipantRow = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  roles: string;
  status: "invited" | "active" | "completed" | "withdrawn";
  deviceNotes: string;
  evidenceConsent: "none" | "notes_only" | "screenshots_allowed";
  passedTasks: number;
  totalRecordedTasks: number;
};
type TaskRow = {
  participantId: string;
  taskKey: string;
  status: string;
  assistanceRequired: number;
  durationMinutes: number | null;
  notes: string;
};

const taskKeySet = new Set<string>(
  pilotTaskDefinitions.map((definition) => definition.key),
);
const participantStatuses = new Set([
  "invited",
  "active",
  "completed",
  "withdrawn",
]);
const taskStatuses = new Set([
  "not_started",
  "passed",
  "blocked",
  "abandoned",
  "not_applicable",
]);
const consentStatuses = new Set([
  "none",
  "notes_only",
  "screenshots_allowed",
]);

export const meta: Route.MetaFunction = () => [
  { title: "Launch Completion | AKARI House" },
  {
    name: "description",
    content:
      "Internal AKARI House V1 seed, pilot and human launch-evidence readiness.",
  },
];

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

async function scalar(db: D1Database, sql: string, ...values: unknown[]) {
  const row = await db.prepare(sql).bind(...values).first<CountRow>();
  return Number(row?.count ?? 0);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  await ensureProductionPilotSchema(db);

  const cohort = await db
    .prepare(
      `SELECT id, name, status, stage, target_size AS targetSize
       FROM pilot_cohorts
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planning' THEN 1
                            WHEN 'paused' THEN 2 ELSE 3 END,
                updated_at DESC
       LIMIT 1`,
    )
    .first<CohortRow>();
  const cohortId = cohort?.id ?? "";

  const [
    publishedProjects,
    publishedOpportunities,
    publishedCampaigns,
    upcomingEvents,
    approvedFounders,
    approvedCreators,
    approvedInvestors,
    multiRoleMembers,
    pilotParticipants,
    completedParticipants,
    pilotFounders,
    pilotCreators,
    pilotInvestors,
    pilotMultiRole,
    openCriticalOrHighFindings,
  ] = await Promise.all([
    scalar(db, `SELECT COUNT(*) AS count FROM projects WHERE status = 'published'`),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM opportunity_listings WHERE status = 'published'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM ambassador_campaigns WHERE status = 'published'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM events
       WHERE status = 'published' AND starts_at >= datetime('now')`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'founder'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'creator'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'investor'
       WHERE u.status = 'active'`,
    ),
    scalar(
      db,
      `SELECT COUNT(*) AS count FROM (
         SELECT u.id
         FROM users u
         JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.status = 'active'
         GROUP BY u.id
         HAVING COUNT(DISTINCT ur.role) > 1
       )`,
    ),
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(*) AS count FROM pilot_participants
           WHERE cohort_id = ? AND status <> 'withdrawn'`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(*) AS count FROM pilot_participants
           WHERE cohort_id = ? AND status = 'completed'`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(DISTINCT pp.user_id) AS count
           FROM pilot_participants pp
           JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'founder'
           WHERE pp.cohort_id = ? AND pp.status <> 'withdrawn'`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(DISTINCT pp.user_id) AS count
           FROM pilot_participants pp
           JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'creator'
           WHERE pp.cohort_id = ? AND pp.status <> 'withdrawn'`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(DISTINCT pp.user_id) AS count
           FROM pilot_participants pp
           JOIN user_roles ur ON ur.user_id = pp.user_id AND ur.role = 'investor'
           WHERE pp.cohort_id = ? AND pp.status <> 'withdrawn'`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(*) AS count FROM (
             SELECT pp.user_id
             FROM pilot_participants pp
             JOIN user_roles ur ON ur.user_id = pp.user_id
             WHERE pp.cohort_id = ? AND pp.status <> 'withdrawn'
             GROUP BY pp.user_id
             HAVING COUNT(DISTINCT ur.role) > 1
           )`,
          cohortId,
        )
      : 0,
    cohortId
      ? scalar(
          db,
          `SELECT COUNT(*) AS count FROM pilot_findings
           WHERE cohort_id = ? AND status <> 'resolved'
             AND severity IN ('critical','high')`,
          cohortId,
        )
      : 0,
  ]);

  const passedTaskRows = cohortId
    ? await db
        .prepare(
          `SELECT DISTINCT task_key AS taskKey
           FROM pilot_task_results
           WHERE cohort_id = ? AND status = 'passed'`,
        )
        .bind(cohortId)
        .all<{ taskKey: string }>()
    : { results: [] as { taskKey: string }[] };

  const readiness = evaluateLaunchCompletion({
    publishedProjects,
    publishedOpportunities,
    publishedCampaigns,
    upcomingEvents,
    approvedFounders,
    approvedCreators,
    approvedInvestors,
    multiRoleMembers,
    pilotParticipants,
    completedParticipants,
    pilotFounders,
    pilotCreators,
    pilotInvestors,
    pilotMultiRole,
    passedTaskKeys: passedTaskRows.results.map((row) => row.taskKey),
    openCriticalOrHighFindings,
  });

  const eligibleUsers = await db
    .prepare(
      `SELECT u.id, u.username, COALESCE(p.display_name, u.username) AS displayName,
              GROUP_CONCAT(DISTINCT ur.role) AS roles
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.status = 'active'
       GROUP BY u.id, u.username, p.display_name
       ORDER BY displayName COLLATE NOCASE
       LIMIT 250`,
    )
    .all<EligibleUserRow>();

  const participants = cohortId
    ? await db
        .prepare(
          `SELECT pp.id, pp.user_id AS userId, u.username,
                  COALESCE(p.display_name, u.username) AS displayName,
                  GROUP_CONCAT(DISTINCT ur.role) AS roles,
                  pp.status, pp.device_notes AS deviceNotes,
                  pp.evidence_consent AS evidenceConsent,
                  COUNT(DISTINCT CASE WHEN ptr.status = 'passed' THEN ptr.task_key END) AS passedTasks,
                  COUNT(DISTINCT CASE WHEN ptr.status <> 'not_started' THEN ptr.task_key END) AS totalRecordedTasks
           FROM pilot_participants pp
           JOIN users u ON u.id = pp.user_id
           LEFT JOIN profiles p ON p.user_id = u.id
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           LEFT JOIN pilot_task_results ptr ON ptr.participant_id = pp.id
           WHERE pp.cohort_id = ?
           GROUP BY pp.id, pp.user_id, u.username, p.display_name, pp.status,
                    pp.device_notes, pp.evidence_consent
           ORDER BY CASE pp.status WHEN 'active' THEN 0 WHEN 'invited' THEN 1
                                   WHEN 'completed' THEN 2 ELSE 3 END,
                    displayName COLLATE NOCASE`,
        )
        .bind(cohortId)
        .all<ParticipantRow>()
    : { results: [] as ParticipantRow[] };

  const taskRows = cohortId
    ? await db
        .prepare(
          `SELECT participant_id AS participantId, task_key AS taskKey, status,
                  assistance_required AS assistanceRequired,
                  duration_minutes AS durationMinutes, notes
           FROM pilot_task_results
           WHERE cohort_id = ?`,
        )
        .bind(cohortId)
        .all<TaskRow>()
    : { results: [] as TaskRow[] };

  return {
    user,
    access,
    cohort,
    readiness,
    openCriticalOrHighFindings,
    eligibleUsers: eligibleUsers.results,
    participants: participants.results,
    taskRows: taskRows.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  await ensureProductionPilotSchema(db);
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "add_participant") {
    const cohortId = text(form, "cohortId");
    const userId = text(form, "userId");
    const status = text(form, "status") || "invited";
    const evidenceConsent = text(form, "evidenceConsent") || "notes_only";
    const deviceNotes = text(form, "deviceNotes").slice(0, 500);
    if (
      !cohortId ||
      !userId ||
      !participantStatuses.has(status) ||
      !consentStatuses.has(evidenceConsent)
    )
      throw new Response("Invalid pilot participant", { status: 400 });

    const eligible = await db
      .prepare(
        `SELECT u.id
         FROM users u
         JOIN membership_applications ma ON ma.user_id = u.id AND ma.status = 'approved'
         WHERE u.id = ? AND u.status = 'active'`,
      )
      .bind(userId)
      .first<{ id: string }>();
    if (!eligible)
      throw new Response("Pilot participants must be active approved members", {
        status: 400,
      });

    await db
      .prepare(
        `INSERT INTO pilot_participants
          (id, cohort_id, user_id, status, device_notes, evidence_consent,
           created_by, started_at, completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? IN ('active','completed') THEN datetime('now') END,
                 CASE WHEN ? = 'completed' THEN datetime('now') END,
                 datetime('now'))
         ON CONFLICT(cohort_id, user_id) DO UPDATE SET
           status = excluded.status,
           device_notes = excluded.device_notes,
           evidence_consent = excluded.evidence_consent,
           started_at = COALESCE(pilot_participants.started_at, excluded.started_at),
           completed_at = CASE WHEN excluded.status = 'completed'
                               THEN COALESCE(pilot_participants.completed_at, datetime('now'))
                               ELSE NULL END,
           updated_at = datetime('now')`,
      )
      .bind(
        crypto.randomUUID(),
        cohortId,
        userId,
        status,
        deviceNotes,
        evidenceConsent,
        user.id,
        status,
        status,
      )
      .run();
    return redirect("/admin/launch-completion");
  }

  if (intent === "update_participant") {
    const participantId = text(form, "participantId");
    const status = text(form, "status");
    const evidenceConsent = text(form, "evidenceConsent");
    const deviceNotes = text(form, "deviceNotes").slice(0, 500);
    if (
      !participantId ||
      !participantStatuses.has(status) ||
      !consentStatuses.has(evidenceConsent)
    )
      throw new Response("Invalid participant update", { status: 400 });
    await db
      .prepare(
        `UPDATE pilot_participants
         SET status = ?, device_notes = ?, evidence_consent = ?,
             started_at = CASE WHEN ? IN ('active','completed')
                               THEN COALESCE(started_at, datetime('now'))
                               ELSE started_at END,
             completed_at = CASE WHEN ? = 'completed'
                                 THEN COALESCE(completed_at, datetime('now'))
                                 ELSE NULL END,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, deviceNotes, evidenceConsent, status, status, participantId)
      .run();
    return redirect("/admin/launch-completion");
  }

  if (intent === "record_task") {
    const participantId = text(form, "participantId");
    const taskKey = text(form, "taskKey") as PilotTaskKey;
    const status = text(form, "taskStatus");
    const assistanceRequired = form.get("assistanceRequired") === "1" ? 1 : 0;
    const durationValue = text(form, "durationMinutes");
    const durationMinutes = durationValue ? Number(durationValue) : null;
    const notes = text(form, "notes").slice(0, 1000);
    if (
      !participantId ||
      !taskKeySet.has(taskKey) ||
      !taskStatuses.has(status) ||
      (durationMinutes !== null &&
        (!Number.isFinite(durationMinutes) || durationMinutes < 0))
    )
      throw new Response("Invalid pilot task result", { status: 400 });

    const participant = await db
      .prepare(
        `SELECT id, cohort_id AS cohortId FROM pilot_participants WHERE id = ?`,
      )
      .bind(participantId)
      .first<{ id: string; cohortId: string }>();
    if (!participant)
      throw new Response("Pilot participant not found", { status: 404 });

    await db
      .prepare(
        `INSERT INTO pilot_task_results
          (id, cohort_id, participant_id, task_key, status,
           assistance_required, duration_minutes, notes, recorded_by,
           completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
                 CASE WHEN ? = 'not_started' THEN NULL ELSE datetime('now') END,
                 datetime('now'))
         ON CONFLICT(participant_id, task_key) DO UPDATE SET
           status = excluded.status,
           assistance_required = excluded.assistance_required,
           duration_minutes = excluded.duration_minutes,
           notes = excluded.notes,
           recorded_by = excluded.recorded_by,
           completed_at = excluded.completed_at,
           updated_at = datetime('now')`,
      )
      .bind(
        crypto.randomUUID(),
        participant.cohortId,
        participantId,
        taskKey,
        status,
        assistanceRequired,
        durationMinutes,
        notes,
        user.id,
        status,
      )
      .run();
    return redirect("/admin/launch-completion");
  }

  throw new Response("Unsupported launch-completion action", { status: 400 });
}

function CheckList({
  title,
  checks,
}: {
  title: string;
  checks: { key: string; label: string; current: number; target: number; passed: boolean }[];
}) {
  return (
    <section className="dashboard-panel">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">Measured from production records</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="application-list">
        {checks.map((item) => (
          <div className="application-card" key={item.key}>
            <div>
              <strong>{item.label}</strong>
              <p>
                {item.current} / {item.target}
              </p>
            </div>
            <span className="status-badge" data-status={item.passed ? "approved" : "pending"}>
              {item.passed ? "Ready" : "Needs work"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminLaunchCompletion({ loaderData }: Route.ComponentProps) {
  const taskByParticipant = new Map(
    loaderData.taskRows.map((row) => [`${row.participantId}:${row.taskKey}`, row]),
  );

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R77 · AKARI House V1 launch completion</span>
            <h1>Finish with evidence, not more feature scope.</h1>
            <p>
              This desk measures live House inventory, real pilot participation,
              role journey evidence and serious unresolved defects. Nothing here
              fabricates users or marks human testing complete automatically.
            </p>
          </div>
          <div className="application-actions">
            <Link className="button button-quiet" to="/admin/production">
              Production evidence
            </Link>
            <Link className="button button-quiet" to="/admin/launch-gate">
              Security launch gate
            </Link>
          </div>
        </header>

        <section className="dashboard-panel">
          <span className="eyebrow">Current V1 decision</span>
          <h2>
            {loaderData.readiness.readyForPublicV1
              ? "Public V1 evidence gate is complete"
              : "Public V1 still has evidence blockers"}
          </h2>
          <p>
            Seed {loaderData.readiness.seedReady ? "ready" : "incomplete"} · Pilot{" "}
            {loaderData.readiness.cohortReady ? "ready" : "incomplete"} · Journeys{" "}
            {loaderData.readiness.journeysReady ? "ready" : "incomplete"} · Serious defects{" "}
            {loaderData.readiness.defectsClear
              ? "clear"
              : `${loaderData.openCriticalOrHighFindings} open`}
          </p>
        </section>

        <CheckList title="Seed the live House" checks={loaderData.readiness.seedChecks} />
        <CheckList title="Balanced real-user pilot" checks={loaderData.readiness.cohortChecks} />

        <section className="dashboard-panel">
          <span className="eyebrow">Required journeys</span>
          <h2>Role journeys that need passed human evidence</h2>
          <div className="application-list">
            {loaderData.readiness.journeyChecks.map((item) => (
              <div className="application-card" key={item.key}>
                <strong>{item.label}</strong>
                <span className="status-badge" data-status={item.passed ? "approved" : "pending"}>
                  {item.passed ? "Passed" : "Not yet passed"}
                </span>
              </div>
            ))}
          </div>
        </section>

        {!loaderData.cohort ? (
          <section className="dashboard-panel">
            <h2>Create the controlled pilot first</h2>
            <p>
              No pilot cohort exists yet. Create one in Production evidence, then
              return here to add real approved members.
            </p>
            <Link className="button button-primary" to="/admin/production">
              Create pilot cohort
            </Link>
          </section>
        ) : (
          <>
            <section className="dashboard-panel">
              <span className="eyebrow">Active evidence cohort</span>
              <h2>{loaderData.cohort.name}</h2>
              <p>
                {loaderData.cohort.status} · {loaderData.cohort.stage} · target{" "}
                {loaderData.cohort.targetSize}
              </p>
              <Form method="post" className="form-grid">
                <input type="hidden" name="intent" value="add_participant" />
                <input type="hidden" name="cohortId" value={loaderData.cohort.id} />
                <label>
                  Approved member
                  <select name="userId" required defaultValue="">
                    <option value="" disabled>
                      Select a real member
                    </option>
                    {loaderData.eligibleUsers.map((member) => (
                      <option value={member.id} key={member.id}>
                        {member.displayName} (@{member.username}) · {member.roles}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Pilot status
                  <select name="status" defaultValue="invited">
                    <option value="invited">Invited</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </label>
                <label>
                  Evidence consent
                  <select name="evidenceConsent" defaultValue="notes_only">
                    <option value="none">No evidence capture</option>
                    <option value="notes_only">Notes only</option>
                    <option value="screenshots_allowed">Screenshots allowed</option>
                  </select>
                </label>
                <label>
                  Device/browser notes
                  <input
                    name="deviceNotes"
                    maxLength={500}
                    placeholder="Example: iPhone Safari, Android Chrome"
                  />
                </label>
                <button className="button button-primary" type="submit">
                  Add real participant
                </button>
              </Form>
            </section>

            <section className="dashboard-panel">
              <span className="eyebrow">Participant evidence</span>
              <h2>Real cohort roster and task results</h2>
              <div className="application-list">
                {loaderData.participants.map((participant) => (
                  <article className="application-card" key={participant.id}>
                    <div>
                      <span className="chapter">{participant.roles}</span>
                      <h3>{participant.displayName}</h3>
                      <p>
                        @{participant.username} · {participant.status} · passed{" "}
                        {participant.passedTasks}/{pilotTaskDefinitions.length} tracked journeys
                      </p>
                      {participant.deviceNotes && <small>{participant.deviceNotes}</small>}
                    </div>
                    <Form method="post" className="form-grid">
                      <input type="hidden" name="intent" value="update_participant" />
                      <input type="hidden" name="participantId" value={participant.id} />
                      <select name="status" defaultValue={participant.status} aria-label="Participant status">
                        <option value="invited">Invited</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                      <select
                        name="evidenceConsent"
                        defaultValue={participant.evidenceConsent}
                        aria-label="Evidence consent"
                      >
                        <option value="none">No evidence capture</option>
                        <option value="notes_only">Notes only</option>
                        <option value="screenshots_allowed">Screenshots allowed</option>
                      </select>
                      <input
                        name="deviceNotes"
                        defaultValue={participant.deviceNotes}
                        maxLength={500}
                        aria-label="Device and browser notes"
                      />
                      <button className="button button-quiet" type="submit">
                        Update participant
                      </button>
                    </Form>

                    <div className="application-list">
                      {pilotTaskDefinitions.map((task) => {
                        const existing = taskByParticipant.get(`${participant.id}:${task.key}`);
                        return (
                          <Form method="post" className="application-card" key={task.key}>
                            <input type="hidden" name="intent" value="record_task" />
                            <input type="hidden" name="participantId" value={participant.id} />
                            <input type="hidden" name="taskKey" value={task.key} />
                            <strong>{task.label}</strong>
                            <select
                              name="taskStatus"
                              defaultValue={existing?.status ?? "not_started"}
                              aria-label={`${task.label} result`}
                            >
                              <option value="not_started">Not started</option>
                              <option value="passed">Passed</option>
                              <option value="blocked">Blocked</option>
                              <option value="abandoned">Abandoned</option>
                              <option value="not_applicable">Not applicable</option>
                            </select>
                            <label>
                              Minutes
                              <input
                                name="durationMinutes"
                                type="number"
                                min={0}
                                defaultValue={existing?.durationMinutes ?? ""}
                              />
                            </label>
                            <label>
                              <input
                                name="assistanceRequired"
                                type="checkbox"
                                value="1"
                                defaultChecked={Boolean(existing?.assistanceRequired)}
                              />{" "}
                              Operator assistance required
                            </label>
                            <input
                              name="notes"
                              maxLength={1000}
                              defaultValue={existing?.notes ?? ""}
                              placeholder="Observed friction, browser or evidence note"
                              aria-label={`${task.label} notes`}
                            />
                            <button className="button button-quiet" type="submit">
                              Save task evidence
                            </button>
                          </Form>
                        );
                      })}
                    </div>
                  </article>
                ))}
                {!loaderData.participants.length && (
                  <p>No real participants have been added to this cohort yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
