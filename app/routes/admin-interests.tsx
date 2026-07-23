import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-interests";
import { SiteHeader } from "~/components/SiteHeader";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireAdmin(request, db);
  const [projects, interests] = await Promise.all([
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
  ]);
  return { user, projects: projects.results, interests: interests.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireAdmin(request, db);
  const form = await request.formData();
  const subjectType = formText(form.get("subjectType"));
  const subjectId = formText(form.get("subjectId"));
  const decision = formText(form.get("decision"));
  if (!["approve", "decline"].includes(decision))
    throw new Response("Invalid decision.", { status: 400 });

  if (subjectType === "project") {
    const project = await db
      .prepare(
        "SELECT founder_user_id AS founderUserId, slug, title FROM projects WHERE id = ? AND status = 'submitted'",
      )
      .bind(subjectId)
      .first<{ founderUserId: string; slug: string; title: string }>();
    if (!project) throw new Response("Project not found.", { status: 404 });
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
          decision === "approve" ? "Project published" : "Project needs revision",
          `${project.title} was ${status}.`,
          `/projects/${project.slug}`,
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
        {actionData?.saved && (
          <p className="notice success">Decision saved.</p>
        )}
        <section>
          <h2>Projects awaiting publication</h2>
          <div className="application-list">
            {loaderData.projects.map((project) => (
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
            ))}
          </div>
        </section>
        <section>
          <h2>Member interest requests</h2>
          <div className="application-list">
            {loaderData.interests.map((interest) => (
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
                  <button
                    className="button button-primary"
                    name="decision"
                    value="approve"
                  >
                    Approve
                  </button>
                  <button
                    className="button button-quiet"
                    name="decision"
                    value="decline"
                  >
                    Decline
                  </button>
                </Form>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
