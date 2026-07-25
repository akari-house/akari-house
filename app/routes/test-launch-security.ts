import type { Route } from "./+types/test-launch-security";
import { issueAccountToken } from "~/lib/account-tokens.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

const fixtureHeader = "launch-gate-v1";

function allowFixtureRequest(request: Request) {
  const url = new URL(request.url);
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    request.headers.get("x-akari-test-fixture") === fixtureHeader
  );
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

async function fixtureUser(db: D1Database, persona: string) {
  return db
    .prepare("SELECT id, status FROM users WHERE username = ?")
    .bind(`launch-gate-${persona.replaceAll("_", "-")}`)
    .first<{ id: string; status: string }>();
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });

  const env = context.get(cloudflareContext).env;
  const form = await request.formData();
  const action = params.action ?? "";

  if (action === "password-reset") {
    const persona = formText(form.get("persona"));
    const user = await fixtureUser(env.DB, persona);
    if (!user) throw new Response("Fixture user not found.", { status: 404 });
    return json({
      token: await issueAccountToken(env.DB, user.id, "password_reset"),
    });
  }

  if (action === "account-state") {
    const persona = formText(form.get("persona"));
    const user = await fixtureUser(env.DB, persona);
    if (!user) throw new Response("Fixture user not found.", { status: 404 });
    const [sessions, resetTokens] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?",
      )
        .bind(user.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM account_tokens
         WHERE user_id = ? AND purpose = 'password_reset'
           AND consumed_at IS NULL AND expires_at > datetime('now')`,
      )
        .bind(user.id)
        .first<{ count: number }>(),
    ]);
    return json({
      status: user.status,
      sessions: sessions?.count ?? 0,
      activeResetTokens: resetTokens?.count ?? 0,
    });
  }

  if (action === "moderation-report") {
    const targetPersona = formText(form.get("targetPersona"));
    const reporterPersona = formText(form.get("reporterPersona")) || "founder";
    const [target, reporter] = await Promise.all([
      fixtureUser(env.DB, targetPersona),
      fixtureUser(env.DB, reporterPersona),
    ]);
    if (!target || !reporter)
      throw new Response("Fixture users not found.", { status: 404 });
    const reportId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM moderation_reports
         WHERE subject_type = 'profile' AND subject_id = ?
           AND details = 'Automated launch-gate suspension fixture.'`,
      ).bind(target.id),
      env.DB.prepare(
        `INSERT INTO moderation_reports
         (id, reporter_user_id, subject_type, subject_id, reason, details)
         VALUES (?, ?, 'profile', ?, 'unsafe',
                 'Automated launch-gate suspension fixture.')`,
      ).bind(reportId, reporter.id, target.id),
    ]);
    return json({ reportId });
  }

  if (action === "grant-state") {
    const projectSlug = formText(form.get("projectSlug"));
    const investorPersona = formText(form.get("investorPersona"));
    const investor = await fixtureUser(env.DB, investorPersona);
    if (!investor)
      throw new Response("Fixture Investor not found.", { status: 404 });
    const project = await env.DB.prepare(
      "SELECT id FROM projects WHERE slug = ?",
    )
      .bind(projectSlug)
      .first<{ id: string }>();
    if (!project) throw new Response("Fixture project not found.", { status: 404 });
    const [grant, active, audits] = await Promise.all([
      env.DB.prepare(
        `SELECT id FROM document_access_grants
         WHERE project_id = ? AND investor_user_id = ?
           AND revoked_at IS NULL AND expires_at > datetime('now')
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(project.id, investor.id)
        .first<{ id: string }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM document_access_grants
         WHERE project_id = ? AND investor_user_id = ?
           AND revoked_at IS NULL AND expires_at > datetime('now')`,
      )
        .bind(project.id, investor.id)
        .first<{ count: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM audit_logs
         WHERE action = 'diligence.document_revoked'
           AND subject_type = 'project' AND subject_id = ?`,
      )
        .bind(project.id)
        .first<{ count: number }>(),
    ]);
    return json({
      grantId: grant?.id ?? null,
      activeGrants: active?.count ?? 0,
      revokeAudits: audits?.count ?? 0,
    });
  }

  if (action === "upload-state") {
    const projectSlug = formText(form.get("projectSlug"));
    const project = await env.DB.prepare(
      "SELECT id FROM projects WHERE slug = ?",
    )
      .bind(projectSlug)
      .first<{ id: string }>();
    if (!project) throw new Response("Fixture project not found.", { status: 404 });
    const documents = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM project_documents WHERE project_id = ?",
    )
      .bind(project.id)
      .first<{ count: number }>();
    const objects = await env.MEDIA.list({
      prefix: `project-documents/${project.id}/`,
      limit: 100,
    });
    return json({
      documents: documents?.count ?? 0,
      objects: objects.objects.length,
    });
  }

  throw new Response("Unknown launch-security action.", { status: 400 });
}
