import type { Route } from "./+types/test-opportunities";
import { cloudflareContext } from "~/lib/cloudflare-context";

const fixtureHeader = "launch-gate-v1";
const projectSlug = "opportunity-gate-project";
const secondProjectSlug = "opportunity-gate-second-project";
const documentObjectKey = "opportunity-gate/diligence-document.txt";
const secondDocumentObjectKey = "opportunity-gate/second-diligence-document.txt";
const confidentialMarker = "CONFIDENTIAL-AKARI-ROOM-EVIDENCE";
const secondConfidentialMarker = "SECOND-DEAL-CONFIDENTIAL-EVIDENCE";

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

async function cleanupProject(
  db: D1Database,
  media: R2Bucket,
  slug: string,
  objectKey: string,
) {
  const project = await db
    .prepare("SELECT id FROM projects WHERE slug = ?")
    .bind(slug)
    .first<{ id: string }>();
  if (project)
    await db.batch([
      db
        .prepare("DELETE FROM opportunity_sections WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM opportunity_questions WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM opportunity_updates WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM introduction_requests WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM opportunity_user_states WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM project_interests WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM document_access_logs WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM document_access_grants WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM data_room_requests WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM opportunity_listings WHERE project_id = ?")
        .bind(project.id),
      db
        .prepare("DELETE FROM project_documents WHERE project_id = ?")
        .bind(project.id),
      db.prepare("DELETE FROM projects WHERE id = ?").bind(project.id),
    ]);
  await media.delete(objectKey);
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });
  const env = context.get(cloudflareContext).env;
  const action = params.action ?? "";
  const [
    founder,
    creator,
    claimed,
    granted,
    expired,
    suspended,
    privateTarget,
  ] = await Promise.all([
    fixtureUser(env.DB, "opp_owner"),
    fixtureUser(env.DB, "opp_creator"),
    fixtureUser(env.DB, "opp_investor"),
    fixtureUser(env.DB, "opp_granted"),
    fixtureUser(env.DB, "opp_expired"),
    fixtureUser(env.DB, "opp_suspended"),
    fixtureUser(env.DB, "opp_private_target"),
  ]);
  if (
    !founder ||
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
    await Promise.all([
      cleanupProject(env.DB, env.MEDIA, projectSlug, documentObjectKey),
      cleanupProject(
        env.DB,
        env.MEDIA,
        secondProjectSlug,
        secondDocumentObjectKey,
      ),
    ]);
    const projectId = crypto.randomUUID();
    const documentId = crypto.randomUUID();
    const documentBody = "private opportunity-gate diligence document";
    await env.MEDIA.put(documentObjectKey, documentBody, {
      httpMetadata: { contentType: "text/plain" },
    });

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects
           (id, founder_user_id, slug, title, summary, description, stage, seeking, status)
           VALUES (?, ?, ?, 'Opportunity Gate Project',
                   'Permission-safe opportunity fixture.',
                   'Used only by isolated opportunity permission tests.',
                   'prototype', 'Test evidence only', 'published')`,
      ).bind(projectId, founder.id, projectSlug),
      env.DB.prepare(
        `INSERT INTO project_documents
           (id, project_id, uploaded_by, title, object_key, content_type,
            byte_size, category, visibility, approved_at, approved_by)
           VALUES (?, ?, ?, 'Opportunity Gate Diligence.txt', ?, 'text/plain', ?,
                   'financial', 'confidential', datetime('now'), ?)`,
      ).bind(
        documentId,
        projectId,
        founder.id,
        documentObjectKey,
        documentBody.length,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO document_access_grants
           (id, project_id, document_id, investor_user_id, granted_by,
            can_download, starts_at, expires_at)
           VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-1 day'),
                   datetime('now', '+7 days'))`,
      ).bind(
        crypto.randomUUID(),
        projectId,
        documentId,
        granted.id,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO document_access_grants
           (id, project_id, document_id, investor_user_id, granted_by,
            can_download, starts_at, expires_at)
           VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-10 days'),
                   datetime('now', '-1 day'))`,
      ).bind(
        crypto.randomUUID(),
        projectId,
        documentId,
        expired.id,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            eligibility_note, reviewed_at, updated_at)
           VALUES (?, 'claimed', '["Infrastructure"]', '["Prototype"]',
                   '["Europe"]',
                   'Claimed Investor fixture without eligibility approval.',
                   NULL, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             status = 'claimed', reviewed_at = NULL, updated_at = datetime('now')`,
      ).bind(claimed.id),
      env.DB.prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            eligibility_note, reviewed_at, updated_at)
           VALUES (?, 'verified', '["Infrastructure"]', '["Prototype"]',
                   '["Europe"]',
                   'Verified Investor fixture with approved room access.',
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
                   '["Europe"]',
                   'Verified Investor fixture with expired room access.',
                   datetime('now'), datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             status = 'verified', reviewed_at = datetime('now'),
             updated_at = datetime('now')`,
      ).bind(expired.id),
      env.DB.prepare(
        `UPDATE role_verifications
         SET status = 'verified', reviewed_at = datetime('now'),
             decision_note = 'Reset by isolated opportunity fixture.',
             updated_at = datetime('now')
         WHERE user_id IN (?, ?) AND role = 'investor'`,
      ).bind(granted.id, expired.id),
      env.DB.prepare(
        `UPDATE users SET status = 'active' WHERE id IN (?, ?)`,
      ).bind(granted.id, expired.id),
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
                   'approved_only',
                   'A permission-safe public opportunity preview.',
                   'Public information contains no private diligence content.',
                   'Early-stage participation can result in total loss and illiquidity.',
                   'published', datetime('now', '-1 day'), ?, datetime('now'),
                   'Approved only for automated permission evidence.', ?, datetime('now'))`,
      ).bind(projectId, founder.id, founder.id),
      env.DB.prepare(
        `INSERT INTO data_room_requests
           (id, project_id, investor_user_id, reason, status,
            reviewed_by, reviewed_at, decision_note, expires_at, updated_at)
           VALUES (?, ?, ?, 'Approved automated Investor access.', 'approved',
                   ?, datetime('now'), 'Approved fixture.',
                   datetime('now', '+7 days'), datetime('now'))`,
      ).bind(crypto.randomUUID(), projectId, granted.id, founder.id),
      env.DB.prepare(
        `INSERT INTO data_room_requests
           (id, project_id, investor_user_id, reason, status,
            reviewed_by, reviewed_at, decision_note, expires_at, updated_at)
           VALUES (?, ?, ?, 'Expired automated Investor access.', 'approved',
                   ?, datetime('now', '-10 days'), 'Expired fixture.',
                   datetime('now', '-1 day'), datetime('now'))`,
      ).bind(crypto.randomUUID(), projectId, expired.id, founder.id),
      env.DB.prepare(
        `INSERT INTO opportunity_sections
           (id, project_id, section_key, title, body, visibility, status,
            sort_order, created_by, reviewed_by, reviewed_at)
         VALUES (?, ?, 'problem_solution', 'Problem and solution',
                 'PUBLIC-STRUCTURED-DEAL-ROOM-EVIDENCE', 'public', 'published',
                 0, ?, ?, datetime('now'))`,
      ).bind(crypto.randomUUID(), projectId, founder.id, founder.id),
      env.DB.prepare(
        `INSERT INTO opportunity_sections
           (id, project_id, section_key, title, body, visibility, status,
            sort_order, created_by, reviewed_by, reviewed_at)
         VALUES (?, ?, 'business_model', 'Business model', ?, 'confidential',
                 'published', 1, ?, ?, datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        projectId,
        confidentialMarker,
        founder.id,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status,
            created_by, reviewed_by, reviewed_at, published_at)
           VALUES (?, ?, 'Private evidence update', ?, 'confidential', 'published',
                   ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        projectId,
        confidentialMarker,
        founder.id,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status,
            created_by, reviewed_by, reviewed_at, published_at)
           VALUES (?, ?, 'Public evidence update',
                   'PUBLIC-AKARI-OPPORTUNITY-EVIDENCE', 'public', 'published',
                   ?, ?, datetime('now'), datetime('now'))`,
      ).bind(crypto.randomUUID(), projectId, founder.id, founder.id),
      env.DB.prepare(
        `UPDATE profile_visibility SET visibility = 'public'
         WHERE user_id IN (?, ?, ?, ?)`,
      ).bind(founder.id, creator.id, granted.id, suspended.id),
      env.DB.prepare(
        `UPDATE profiles SET visibility = 'public'
         WHERE user_id IN (?, ?, ?, ?)`,
      ).bind(founder.id, creator.id, granted.id, suspended.id),
      env.DB.prepare(
        `UPDATE profile_visibility SET visibility = 'private' WHERE user_id = ?`,
      ).bind(privateTarget.id),
      env.DB.prepare(
        `UPDATE profiles SET visibility = 'private' WHERE user_id = ?`,
      ).bind(privateTarget.id),
    ]);

    return json({
      projectSlug,
      projectId,
      documentId,
      confidentialMarker,
    });
  }

  if (action === "cross-deal") {
    await cleanupProject(
      env.DB,
      env.MEDIA,
      secondProjectSlug,
      secondDocumentObjectKey,
    );
    const secondProjectId = crypto.randomUUID();
    const secondDocumentId = crypto.randomUUID();
    const documentBody = "private second Deal Room diligence document";
    await env.MEDIA.put(secondDocumentObjectKey, documentBody, {
      httpMetadata: { contentType: "text/plain" },
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects
           (id, founder_user_id, slug, title, summary, description, stage, seeking, status)
         VALUES (?, ?, ?, 'Second Opportunity Gate Project',
                 'Second isolated opportunity for cross-deal denial.',
                 'Approval for the first opportunity must never unlock this one.',
                 'prototype', 'Test evidence only', 'published')`,
      ).bind(secondProjectId, founder.id, secondProjectSlug),
      env.DB.prepare(
        `INSERT INTO opportunity_listings
           (project_id, sector, geography, funding_instrument,
            raise_currency, access_mode, public_summary, public_highlights,
            risk_summary, status, submitted_at, reviewed_by, reviewed_at,
            decision_note, created_by, updated_at)
         VALUES (?, 'Infrastructure', 'Europe', 'safe', 'USD', 'approved_only',
                 'A second permission-safe public preview.',
                 'No approval has been issued for this Deal Room.',
                 'Separate Deal Room approval is required.', 'published',
                 datetime('now'), ?, datetime('now'), 'Cross-deal evidence.', ?,
                 datetime('now'))`,
      ).bind(secondProjectId, founder.id, founder.id),
      env.DB.prepare(
        `INSERT INTO project_documents
           (id, project_id, uploaded_by, title, object_key, content_type,
            byte_size, category, visibility, approved_at, approved_by)
         VALUES (?, ?, ?, 'Second Opportunity Diligence.txt', ?, 'text/plain', ?,
                 'financial', 'confidential', datetime('now'), ?)`,
      ).bind(
        secondDocumentId,
        secondProjectId,
        founder.id,
        secondDocumentObjectKey,
        documentBody.length,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO document_access_grants
           (id, project_id, document_id, investor_user_id, granted_by,
            can_download, starts_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-1 day'),
                 datetime('now', '+7 days'))`,
      ).bind(
        crypto.randomUUID(),
        secondProjectId,
        secondDocumentId,
        granted.id,
        founder.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_updates
           (id, project_id, title, body, visibility, status,
            created_by, reviewed_by, reviewed_at, published_at)
         VALUES (?, ?, 'Second private update', ?, 'confidential', 'published',
                 ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        crypto.randomUUID(),
        secondProjectId,
        secondConfidentialMarker,
        founder.id,
        founder.id,
      ),
    ]);
    return json({
      secondProjectSlug,
      secondProjectId,
      secondDocumentId,
      secondConfidentialMarker,
    });
  }

  const project = await env.DB.prepare(
    "SELECT id, founder_user_id AS founderUserId FROM projects WHERE slug = ?",
  )
    .bind(projectSlug)
    .first<{ id: string; founderUserId: string }>();
  if (!project)
    throw new Response("Create the opportunity fixture first.", {
      status: 409,
    });

  if (action === "restrict-investor") {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE investor_profiles
         SET status = 'restricted', decision_note = 'Automated restriction.',
             reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE user_id = ?`,
      ).bind(granted.id),
      env.DB.prepare(
        `UPDATE role_verifications
         SET status = 'revoked', decision_note = 'Automated restriction.',
             reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE user_id = ? AND role = 'investor'`,
      ).bind(granted.id),
    ]);
    return json({ restricted: true });
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
         WHERE action = 'opportunity.access_revoked' AND subject_id = ?`,
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
