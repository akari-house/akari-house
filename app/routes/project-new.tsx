import { Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/project-new";
import { ProjectNeedsFieldset } from "~/components/projects/ProjectNeedsFieldset";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { projectSeekingFromForm } from "~/lib/project-needs";
import { hasRole, uniqueProjectSlug } from "~/lib/projects.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireApprovedMember(
    request,
    context.get(cloudflareContext).env.DB,
  );
  if (!hasRole(user, "founder"))
    throw new Response("Founder role required.", { status: 403 });
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!hasRole(user, "founder"))
    throw new Response("Founder role required.", { status: 403 });
  const form = await request.formData();
  const title = formText(form.get("title")).trim();
  const summary = formText(form.get("summary")).trim();
  const description = formText(form.get("description")).trim();
  const seekingInput = projectSeekingFromForm(form);
  const stage = formText(form.get("stage"));
  if (seekingInput.error) return { error: seekingInput.error };
  if (
    title.length < 3 ||
    title.length > 100 ||
    summary.length < 20 ||
    summary.length > 280 ||
    description.length > 4000 ||
    seekingInput.value.length > 600 ||
    !["idea", "prototype", "early_revenue", "growth"].includes(stage)
  )
    return { error: "Check the project fields and length limits." };
  const id = crypto.randomUUID();
  const slug = await uniqueProjectSlug(db, title);
  await db.batch([
    db
      .prepare(
        `INSERT INTO projects
         (id, founder_user_id, slug, title, summary, description, stage,
          seeking, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      )
      .bind(
        id,
        user.id,
        slug,
        title,
        summary,
        description,
        stage,
        seekingInput.value,
      ),
    db
      .prepare(
        `INSERT INTO project_relationships
         (project_id, user_id, relationship_type, claim_status, evidence_note)
         VALUES (?, ?, 'founder', 'self_declared', ?)`,
      )
      .bind(
        id,
        user.id,
        "Declared automatically when this Founder created the project in AKARI House.",
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'project.submitted', 'project', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        id,
        JSON.stringify({ needs: seekingInput.needs }),
      ),
  ]);
  throw redirect(`/projects/${slug}?submitted=1`);
}

export default function ProjectNew({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main project-onboarding-main">
        <span className="eyebrow">Founder project desk</span>
        <h1>Start with the project people need to understand.</h1>
        <p>
          This first step creates the project and sends it for review. After
          that, AKARI will guide you through identity, official links and the
          remaining discovery-readiness items without asking you to repeat the
          same information.
        </p>

        <ol className="project-onboarding-steps" aria-label="Project onboarding steps">
          <li className="is-current">
            <strong>1. Project story</strong>
            <span>Name, summary, stage and what support you need.</span>
          </li>
          <li>
            <strong>2. Identity & links</strong>
            <span>Logo, banner, website and official social channels.</span>
          </li>
          <li>
            <strong>3. Readiness</strong>
            <span>AKARI shows what is missing and the next useful action.</span>
          </li>
        </ol>

        <Form method="post" className="profile-form project-onboarding-form">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <label>
            Project name
            <input name="title" minLength={3} maxLength={100} required />
          </label>
          <label>
            One clear summary
            <textarea
              name="summary"
              rows={3}
              minLength={20}
              maxLength={280}
              required
            />
            <small>
              Explain the project in plain language so a Creator, Founder or
              Investor can understand it quickly.
            </small>
          </label>
          <label>
            The fuller story
            <textarea name="description" rows={8} maxLength={4000} />
            <small>
              Aim for at least a short paragraph covering the problem, product
              and who it is for. You can refine this later.
            </small>
          </label>
          <label>
            Stage
            <select name="stage" defaultValue="idea">
              <option value="idea">Idea</option>
              <option value="prototype">Prototype</option>
              <option value="early_revenue">Early revenue</option>
              <option value="growth">Growth</option>
            </select>
          </label>
          <ProjectNeedsFieldset />
          <p className="project-onboarding-note">
            Submitting does not make the project public immediately. Existing
            AKARI review and permission rules remain unchanged.
          </p>
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle"
              ? "Create project and continue"
              : "Creating project..."}
          </button>
        </Form>
      </main>
    </div>
  );
}
