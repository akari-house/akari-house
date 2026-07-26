import type { Route } from "./+types/test-opportunities";
import { cloudflareContext } from "~/lib/cloudflare-context";

const fixtureHeader = "launch-gate-v1";
const projectSlug = "launch-gate-owned-project";
const confidentialMarker = "CONFIDENTIAL-AKARI-ROOM-EVIDENCE";

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

async function fixtureUser(db: D1Database, persona: string) {
  return db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(`launch-gate-${persona.replaceAll("_", "-")}`)
    .first<{ id: string }>();
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });
  const env = context.get(cloudflareContext).env;
  const action = params.action ?? "";
  const project = await env.DB.prepare(
    "SELECT id, founder_user_id AS founderUserId FROM projects WHERE slug = ?",
  )
    .bind(projectSlug)
    .first<{ id: string; founderUserId: string }>();
  if (!project)
    throw new Response("Create the launch-gate project first.", {
      status: 409,
    });

  const [creator, claimed, granted, expired, suspended, privateTarget] =
    await Promise.all([
      fixtureUser(env.DB, "creator"),
      fixtureUser(env.DB, "investor"),
      fixtureUser(env.DB, "investor_granted"),
      fixtureUser(env.DB, "investor_expired"),
      fixtureUser(env.DB, "suspended"),
      fixtureUser(env.DB, "private_target"),
    ]);
  if (
    !creator ||
    !claimed ||
    !granted ||
    !expired ||
    !suspended ||
    !privateTarget
  )
    throw new Response("Create all opportunity personas first.", {
      status: 409,
    });

  if (action === "seed") {
    const document = await env.DB.prepare(
      "SELECT id FROM project_documents WHERE project_id = ? LIMIT 1",
    )
      .bind(project.id)
      .first<{ id: string }>();
    if (!document)
      throw new Response("Create the diligence fixture first.", {
        status: 409,
      });

    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM opportunity_updates WHERE project_id = ?",
      ).bind(project.id),
      env.DB.prepare(
        "DELETE FROM opportunity_questions WHERE project_id = ?",
      ).bind(project.id),
      env.DB.prepare(
        "DELETE FROM introduction_requests WHERE project_id = ?",
      ).bind(project.id),
      env.DB.prepare(
        "DELETE FROM opportunity_user_states WHERE project_id = ?",
      ).bind(project.id),
      env.DB.prepare(
        "DELETE FROM data_room_requests WHERE project_id = ?",
      ).bind(project.id),
      env.DB.prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            eligibility_note, reviewed_at, updated_at)
         VALUES (?, 'claimed', '["Infrastructure"]', '["Prototype"]',
                 '["Europe"]', 'Claimed Investor fixture without eligibility approval.',
                 NULL, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           status = 'claimed', reviewed_at = NULL, updated_at = datetime('now')`,
      ).bind(claimed.id),
      env.DB.prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            eligibility_note, reviewed_at, updated_at)
         VALUES (?, 'verified', '["Infrastructure"]', '["Prototype"]',
                 '["Europe"]', 'Verified Investor fixture with approved room access.',
                 datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           status = 'verified', reviewed_at = datetime('now'),
           updated_at = datetime('now')`,
      ).bind(granted.id),
      env.DB.prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            eligibility_note, reviewed_at, updated_at)
         VALUES (?, 'verified', '["Infrastructure"]', '["Prototype"]',
                 '["Europe"]', 'Verified Investor fixture with expired room access.',
                 datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           status = 'verified', reviewed_at = datetime('now'),
           updated_at = datetime('now')`,
      ).bind(expired.id),
      env.DB.prepare(
        `INSERT INTO opportunity_listings
           (project_id, sector, geography, funding_instrument,
            raise_minimum, raise_maximum, raise_currency,
            minimum_participation, traction_stage, closing_at,
            access_mode, public_summary, public_highlights, risk_summary,
            status, submitted_at, reviewed_by, reviewed_at,
            decision_note, created_by, updated_at)
         VALUES (?, 'Infrastructure', 'Europe', 'safe', 500000, 1000000,
                 'USD', 25000, 'Prototype validated', datetime('now', '+21 days'),
                 'approved_only', 'A permission-safe public opportunity preview.',
                 'Public information contains no private diligence content.',
                 'Early-stage participation can result in total loss and illiquidity.',
                 'published', datetime('now', '-1 day'), ?, datetime('now'),
                 'Approved only for automated permission evidence.', ?, datetime('now'))
         ON CONFLICT(project_id) DO UPDATE SET
           status = 'published', access_mode = 'approved_only',
           public_summary = excluded.public_summary,
           public_highlights = excluded.public_highlights,
           risk_summary = excluded.risk_summary,
           reviewed_by = excluded.reviewed_by,
           reviewed_at = datetime('now'), updated_at = datetime('now')`,
      ).bind(project.id, project.founderUserId, project.founderUserId),
      env.DB.prepare(
        `UPDATE project_documents
         SET approved_at = datetime('now'), approved_by = ?,
             category = 'financial', visibility = 'confidential'
         WHERE id = ?`,
      ).bind(project.founderUserId, document.id),
      env.DB.prepare(
        `INSERT INTO data_room_requests
           (id, project_id, investor_user_id, reason, status,
            reviewed_by, reviewed_at, decision_note, expires_at, updated_at)
         VALUES (?, ?, ?, 'Approved automated Investor access.', 'approved',
                 ?, datetime('now'), 'Approved fixture.',
                 datetime('now', '+7 days'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        project.id,
        granted.id,
        project.founderUserId,
      ),
      env.DB.prepare(
        `INSERT INTO data_room_requests
           (id, project_id, investor_user_id, reason, status,
            reviewed_by, reviewed_at, decision_note, expires_at, updated_at)
         VALUES (?, ?, ?, 'Expired automated Investor access.', 'approved',
                 ?, datetime('now', '-10 days'), 'Expired fixture.',
                 datetime('now', '-1 day'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        project.id,
        expired.id,
        project.founderUserId,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status,
            created_by, reviewed_by, reviewed_at, published_at)
         VALUES (?, ?, 'Private evidence update', ?, 'confidential', 'published',
                 ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        project.id,
        confidentialMarker,
        project.founderUserId,
        project.founderUserId,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status,
            created_by, reviewed_by, reviewed_at, published_at)
         VALUES (?, ?, 'Public evidence update',
                 'PUBLIC-AKARI-OPPORTUNITY-EVIDENCE', 'public', 'published',
                 ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        project.id,
        project.founderUserId,
        project.founderUserId,
      ),
      env.DB.prepare(
        `UPDATE profile_visibility SET visibility = 'public'
         WHERE user_id IN (?, ?, ?, ?)`,
      ).bind(project.founderUserId, creator.id, granted.id, suspended.id),
      env.DB.prepare(
        `UPDATE profiles SET visibility = 'public'
         WHERE user_id IN (?, ?, ?, ?)`,
      ).bind(project.founderUserId, creator.id, granted.id, suspended.id),
      env.DB.prepare(
        `UPDATE profile_visibility SET visibility = 'private' WHERE user_id = ?`,
      ).bind(privateTarget.id),
      env.DB.prepare(
        `UPDATE profiles SET visibility = 'private' WHERE user_id = ?`,
      ).bind(privateTarget.id),
    ]);
    return json({
      projectSlug,
      projectId: project.id,
      documentId: document.id,
      confidentialMarker,
    });
  }

  if (action === "revoke") {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE data_room_requests
         SET status = 'revoked', reviewed_by = ?, reviewed_at = datetime('now'),
             decision_note = 'Automated immediate revocation evidence.',
             updated_at = datetime('now')
         WHERE project_id = ? AND investor_user_id = ? AND status = 'approved'`,
      ).bind(project.founderUserId, project.id, granted.id),
      env.DB.prepare(
        `UPDATE document_access_grants
         SET revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
         WHERE project_id = ? AND investor_user_id = ? AND revoked_at IS NULL`,
      ).bind(project.founderUserId, project.id, granted.id),
      env.DB.prepare(
        `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'opportunity.access_revoked', 'opportunity', ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        project.founderUserId,
        project.id,
        JSON.stringify({ investorUserId: granted.id, fixture: true }),
      ),
    ]);
    return json({ revoked: true });
  }

  if (action === "state") {
    const [listing, access, audit] = await Promise.all([
      env.DB.prepare(
        "SELECT status FROM opportunity_listings WHERE project_id = ?",
      )
        .bind(project.id)
        .first<{ status: string }>(),
      env.DB.prepare(
        `SELECT status, expires_at AS expiresAt FROM data_room_requests
         WHERE project_id = ? AND investor_user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(project.id, granted.id)
        .first<{ status: string; expiresAt: string | null }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM audit_logs
         WHERE action = 'opportunity.access_revoked'
           AND subject_id = ?`,
      )
        .bind(project.id)
        .first<{ count: number }>(),
    ]);
    return json({
      listingStatus: listing?.status ?? null,
      accessStatus: access?.status ?? null,
      expiresAt: access?.expiresAt ?? null,
      revokeAudits: audit?.count ?? 0,
    });
  }

  throw new Response("Unknown opportunity fixture action.", { status: 400 });
}
