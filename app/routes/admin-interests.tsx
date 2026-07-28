import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-interests";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { EventTimeDisplay } from "~/components/EventTimeDisplay";
import { isValidDecisionNote } from "~/lib/review";
import { isRoleVerifiedId } from "~/lib/role-verification.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdminScope(request, db, "projects");
  const [projects, interests, events] = await Promise.all([
    db
      .prepare(
        `SELECT pr.id, pr.slug, pr.title, pr.summary, pr.stage,
                pr.created_at AS createdAt, p.display_name AS founderName
         FROM projects pr JOIN profiles p ON p.user_id = pr.founder_user_id
         WHERE pr.status = 'submitted' ORDER BY pr.created_at`,
      )
      .all<{
        id: string;
        slug: string;
        title: string;
        summary: string;
        stage: string;
        createdAt: string;
        founderName: string;
      }>(),
    db
      .prepare(
        `SELECT ir.id, ir.interest_type AS interestType, ir.note,
                ir.created_at AS createdAt, p.display_name AS displayName,
                u.username
         FROM interest_requests ir
         JOIN users u ON u.id = ir.user_id
         JOIN profiles p ON p.user_id = u.id
         WHERE ir.status = 'pending' ORDER BY ir.created_at`,
      )
      .all<{
        id: string;
        interestType: string;
        note: string;
        createdAt: string;
        displayName: string;
        username: string;
      }>(),
    db
      .prepare(
        `SELECT e.id, e.slug, e.title, e.summary, e.description, e.format,
                e.venue, e.meeting_url AS meetingUrl,
                e.starts_at AS startsAt, e.ends_at AS endsAt, e.timezone,
                e.capacity, e.image_key AS imageKey,
                e.image_source_url AS imageSourceUrl,
                p.display_name AS hostName
         FROM events e JOIN profiles p ON p.user_id = e.host_user_id
         WHERE e.status = 'submitted' ORDER BY e.created_at`,
      )
      .all<{
        id: string;
        slug: string;
        title: string;
        summary: string;
        description: string;
        format: string;
        venue: string;
        meetingUrl: string;
        startsAt: string;
        endsAt: string;
        timezone: string;
        capacity: number | null;
        imageKey: string | null;
        imageSourceUrl: string;
        hostName: string;
      }>(),
  ]);
  return {
    user,
    projects: projects.results,
    interests: interests.results,
    events: events.results,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdminScope(request, db, "projects");
  const form = await request.formData();
  const subjectType = formText(form.get("subjectType"));
  const subjectId = formText(form.get("subjectId"));
  const decision = formText(form.get("decision"));
  const decisionNote = formText(form.get("decisionNote")).trim();
  if (!["approve", "decline"].includes(decision))
    throw new Response("Invalid decision.", { status: 400 });
  if (!isValidDecisionNote(decisionNote))
    return { error: "Add a decision note between 5 and 500 characters." };

  if (subjectType === "project") {
    const project = await db
      .prepare(
        "SELECT founder_user_id AS founderUserId, slug, title FROM projects WHERE id = ? AND status = 'submitted'",
      )
      .bind(subjectId)
      .first<{ founderUserId: string; slug: string; title: string }>();
    if (!project) throw new Response("Project not found.", { status: 404 });
    if (
      decision === "approve" &&
      !(await isRoleVerifiedId(db, project.founderUserId, "founder"))
    )
      return {
        error:
          "Verify the Founder before publishing this project. Drafts and review notes remain available.",
      };
    const status = decision === "approve" ? "published" : "declined";
    await db.batch([
      db
        .prepare(
          `UPDATE projects SET status = ?, reviewed_by = ?,
           reviewed_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(status, admin.id, subjectId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'project.reviewed', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          project.founderUserId,
          decision === "approve"
            ? "Project published"
            : "Project needs revision",
          `${project.title} was ${status}.`,
          `/projects/${project.slug}`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'project.reviewed', 'project', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          subjectId,
          JSON.stringify({ status, decisionNote }),
        ),
    ]);
  } else if (subjectType === "event") {
    const event = await db
      .prepare(
        `SELECT host_user_id AS hostUserId, slug, title
         FROM events WHERE id = ? AND status = 'submitted'`,
      )
      .bind(subjectId)
      .first<{ hostUserId: string; slug: string; title: string }>();
    if (!event) throw new Response("Event not found.", { status: 404 });
    const status = decision === "approve" ? "published" : "declined";
    await db.batch([
      db
        .prepare(
          `UPDATE events SET status = ?, reviewed_by = ?,
           reviewed_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(status, admin.id, subjectId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'event.reviewed', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          event.hostUserId,
          decision === "approve" ? "Event published" : "Event needs revision",
          `${event.title} was ${status}. Review note: ${decisionNote}`,
          `/events/${event.slug}`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'event.reviewed', 'event', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          subjectId,
          JSON.stringify({ status, decisionNote }),
        ),
    ]);
  } else if (subjectType === "interest") {
    const interest = await db
      .prepare(
        "SELECT user_id AS userId, interest_type AS interestType FROM interest_requests WHERE id = ? AND status = 'pending'",
      )
      .bind(subjectId)
      .first<{ userId: string; interestType: string }>();
    if (!interest) throw new Response("Interest not found.", { status: 404 });
    const status = decision === "approve" ? "approved" : "declined";
    await db.batch([
      db
        .prepare(
          `UPDATE interest_requests SET status = ?,
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(status, subjectId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'interest.reviewed', 'Interest request reviewed',
                   ?, '/app')`,
        )
        .bind(
          crypto.randomUUID(),
          interest.userId,
          `Your ${interest.interestType.replaceAll("_", " ")} request was ${status}.`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'interest.reviewed', 'interest_request', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          subjectId,
          JSON.stringify({ status, decisionNote }),
        ),
    ]);
  } else throw new Response("Invalid subject.", { status: 400 });
  return { saved: true };
}

export default function AdminInterests({
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
            <span className="eyebrow">AKARI review desk</span>
            <h1>Projects and interests</h1>
          </div>
          <Link className="button button-quiet" to="/admin/applications">
            Membership applications
          </Link>
        </header>
        {actionData?.saved && <p className="notice success">Decision saved.</p>}
        <section>
          <h2>Projects awaiting publication</h2>
          <div
            className="application-list"
            aria-busy={navigation.state !== "idle"}
          >
            {loaderData.projects.length ? (
              loaderData.projects.map((project) => (
                <article className="application-card" key={project.id}>
                  <div>
                    <span className="chapter">{project.stage}</span>
                    <h3>{project.title}</h3>
                    <p>{project.summary}</p>
                    <small>Founder: {project.founderName}</small>
                  </div>
                  <Form method="post" className="application-actions">
                    <input type="hidden" name="subjectType" value="project" />
                    <input type="hidden" name="subjectId" value={project.id} />
                    <label>
                      Decision note
                      <textarea
                        name="decisionNote"
                        minLength={5}
                        maxLength={500}
                        required
                        rows={3}
                      />
                    </label>
                    <button
                      className="button button-primary"
                      name="decision"
                      value="approve"
                      disabled={navigation.state !== "idle"}
                    >
                      Publish
                    </button>
                    <button
                      className="button button-quiet"
                      name="decision"
                      value="decline"
                      disabled={navigation.state !== "idle"}
                    >
                      Decline
                    </button>
                  </Form>
                </article>
              ))
            ) : (
              <div className="status-card">
                <h3>No projects awaiting review.</h3>
                <p>New founder submissions will appear in this queue.</p>
              </div>
            )}
          </div>
        </section>
        <section>
          <h2>Events awaiting publication</h2>
          <div
            className="application-list"
            aria-busy={navigation.state !== "idle"}
          >
            {loaderData.events.length ? (
              loaderData.events.map((event) => (
                <article className="application-card" key={event.id}>
                  <div>
                    {event.imageKey && (
                      <>
                        <img
                          className="review-event-cover"
                          src={`/media/events/${event.slug}`}
                          alt={`${event.title} proposed cover`}
                          width={720}
                          height={405}
                        />
                        {event.imageSourceUrl && (
                          <a
                            className="quiet-link"
                            href={event.imageSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Verify original image source
                          </a>
                        )}
                      </>
                    )}
                    <span className="chapter">
                      {event.format.replace("_", " ")}
                    </span>
                    <h3>{event.title}</h3>
                    <p>{event.summary}</p>
                    {event.description && (
                      <details>
                        <summary>Read full event description</summary>
                        <p>{event.description}</p>
                      </details>
                    )}
                    <small>Hosted by {event.hostName}</small>
                    <EventTimeDisplay
                      startsAt={event.startsAt}
                      timezone={event.timezone}
                    />
                    <dl className="review-event-facts">
                      <div>
                        <dt>Ends</dt>
                        <dd>
                          <EventTimeDisplay
                            startsAt={event.endsAt}
                            timezone={event.timezone}
                            showViewerTime={false}
                          />
                        </dd>
                      </div>
                      <div>
                        <dt>Venue</dt>
                        <dd>{event.venue || "Online"}</dd>
                      </div>
                      <div>
                        <dt>Capacity</dt>
                        <dd>{event.capacity ?? "Open"}</dd>
                      </div>
                    </dl>
                    {event.meetingUrl && (
                      <a
                        className="quiet-link"
                        href={event.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Verify meeting destination
                      </a>
                    )}
                  </div>
                  <Form method="post" className="application-actions">
                    <input type="hidden" name="subjectType" value="event" />
                    <input type="hidden" name="subjectId" value={event.id} />
                    <label>
                      Decision note
                      <textarea
                        name="decisionNote"
                        minLength={5}
                        maxLength={500}
                        required
                        rows={3}
                      />
                    </label>
                    <button
                      className="button button-primary"
                      name="decision"
                      value="approve"
                      disabled={navigation.state !== "idle"}
                    >
                      Publish
                    </button>
                    <button
                      className="button button-quiet"
                      name="decision"
                      value="decline"
                      disabled={navigation.state !== "idle"}
                    >
                      Decline
                    </button>
                  </Form>
                </article>
              ))
            ) : (
              <div className="status-card">
                <h3>No events awaiting review.</h3>
                <p>New host proposals will appear in this queue.</p>
              </div>
            )}
          </div>
        </section>
        <section>
          <h2>Member interest requests</h2>
          <div
            className="application-list"
            aria-busy={navigation.state !== "idle"}
          >
            {loaderData.interests.length ? (
              loaderData.interests.map((interest) => (
                <article className="application-card" key={interest.id}>
                  <div>
                    <span className="chapter">
                      {interest.interestType.replaceAll("_", " ")}
                    </span>
                    <h3>{interest.displayName}</h3>
                    <p>{interest.note || "No additional note."}</p>
                  </div>
                  <Form method="post" className="application-actions">
                    <input type="hidden" name="subjectType" value="interest" />
                    <input type="hidden" name="subjectId" value={interest.id} />
                    <label>
                      Decision note
                      <textarea
                        name="decisionNote"
                        minLength={5}
                        maxLength={500}
                        required
                        rows={3}
                      />
                    </label>
                    <button
                      className="button button-primary"
                      name="decision"
                      value="approve"
                      disabled={navigation.state !== "idle"}
                    >
                      Approve
                    </button>
                    <button
                      className="button button-quiet"
                      name="decision"
                      value="decline"
                      disabled={navigation.state !== "idle"}
                    >
                      Decline
                    </button>
                  </Form>
                </article>
              ))
            ) : (
              <div className="status-card">
                <h3>No access requests awaiting review.</h3>
                <p>
                  Member ambassador, project and event-host requests appear
                  here.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
