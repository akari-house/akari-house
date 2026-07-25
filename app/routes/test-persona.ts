import type { Route } from "./+types/test-persona";
import { createSession } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import type { Role } from "~/lib/domain";
import { hashPassword } from "~/lib/security.server";

const fixtureHeader = "launch-gate-v1";
const fixtureProjectSlug = "launch-gate-owned-project";
const fixtureCampaignSlug = "launch-gate-iio";
const fixtureDocumentObjectKey = "launch-gate/diligence-document.txt";

const personaSpecs: Record<
  string,
  {
    status: "active" | "restricted" | "suspended";
    roles: Role[];
    membership: "approved" | "pending_review";
    admin?: "membership" | "campaigns" | "moderation" | "superadmin";
    privateProfile?: boolean;
    invalidateSession?: boolean;
  }
> = {
  applicant: {
    status: "restricted",
    roles: ["founder"],
    membership: "pending_review",
  },
  founder: { status: "active", roles: ["founder"], membership: "approved" },
  project_owner: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
  },
  creator: { status: "active", roles: ["creator"], membership: "approved" },
  creator_selected: {
    status: "active",
    roles: ["creator"],
    membership: "approved",
  },
  creator_other: {
    status: "active",
    roles: ["creator"],
    membership: "approved",
  },
  investor: {
    status: "active",
    roles: ["investor"],
    membership: "approved",
  },
  investor_granted: {
    status: "active",
    roles: ["investor"],
    membership: "approved",
  },
  investor_expired: {
    status: "active",
    roles: ["investor"],
    membership: "approved",
  },
  multi_role: {
    status: "active",
    roles: ["founder", "creator", "investor"],
    membership: "approved",
  },
  scoped_admin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "membership",
  },
  campaign_admin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "campaigns",
  },
  moderator: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "moderation",
  },
  superadmin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "superadmin",
  },
  suspended: {
    status: "suspended",
    roles: ["founder"],
    membership: "approved",
  },
  blocked: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    invalidateSession: true,
  },
  private_target: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    privateProfile: true,
  },
};

type SeededResources = {
  projectSlug: string;
  documentId: string;
  campaignSlug: string;
};

type FixtureEnvironment = { DB: D1Database; MEDIA: R2Bucket };

function allowFixtureRequest(request: Request) {
  const url = new URL(request.url);
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    request.headers.get("x-akari-test-fixture") === fixtureHeader
  );
}

async function fixtureUserId(db: D1Database, persona: string) {
  return db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(`launch-gate-${persona.replaceAll("_", "-")}`)
    .first<{ id: string }>();
}

async function cleanupLaunchGateResources(env: FixtureEnvironment) {
  const campaign = await env.DB.prepare(
    "SELECT id FROM ambassador_campaigns WHERE slug = ?",
  )
    .bind(fixtureCampaignSlug)
    .first<{ id: string }>();
  if (campaign) {
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM campaign_settlement_adjustments
         WHERE settlement_id IN (
           SELECT id FROM campaign_settlements WHERE campaign_id = ?
         )`,
      ).bind(campaign.id),
      env.DB.prepare("DELETE FROM campaign_disputes WHERE campaign_id = ?").bind(
        campaign.id,
      ),
      env.DB.prepare("DELETE FROM campaign_settlements WHERE campaign_id = ?").bind(
        campaign.id,
      ),
      env.DB.prepare(
        "DELETE FROM campaign_work_submissions WHERE campaign_id = ?",
      ).bind(campaign.id),
      env.DB.prepare("DELETE FROM campaign_moderators WHERE campaign_id = ?").bind(
        campaign.id,
      ),
      env.DB.prepare("DELETE FROM campaign_final_reports WHERE campaign_id = ?").bind(
        campaign.id,
      ),
      env.DB.prepare("DELETE FROM campaign_applications WHERE campaign_id = ?").bind(
        campaign.id,
      ),
      env.DB.prepare("DELETE FROM ambassador_campaigns WHERE id = ?").bind(
        campaign.id,
      ),
    ]);
  }

  const project = await env.DB.prepare("SELECT id FROM projects WHERE slug = ?")
    .bind(fixtureProjectSlug)
    .first<{ id: string }>();
  if (project) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM document_access_logs WHERE project_id = ?").bind(
        project.id,
      ),
      env.DB.prepare("DELETE FROM document_access_grants WHERE project_id = ?").bind(
        project.id,
      ),
      env.DB.prepare("DELETE FROM data_room_requests WHERE project_id = ?").bind(
        project.id,
      ),
      env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id),
    ]);
  }
  await env.MEDIA.delete(fixtureDocumentObjectKey);
}

async function seedLaunchGateResources(
  env: FixtureEnvironment,
  founderUserId: string,
): Promise<SeededResources> {
  const [
    selectedCreator,
    otherCreator,
    grantedInvestor,
    expiredInvestor,
    moderator,
  ] = await Promise.all([
    fixtureUserId(env.DB, "creator_selected"),
    fixtureUserId(env.DB, "creator_other"),
    fixtureUserId(env.DB, "investor_granted"),
    fixtureUserId(env.DB, "investor_expired"),
    fixtureUserId(env.DB, "moderator"),
  ]);
  if (
    !selectedCreator ||
    !otherCreator ||
    !grantedInvestor ||
    !expiredInvestor ||
    !moderator
  )
    throw new Response("Create linked launch-gate personas first.", {
      status: 409,
    });

  const projectId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  const campaignId = crypto.randomUUID();
  const selectedApplicationId = crypto.randomUUID();
  const fixtureBody = "private launch-gate diligence document";

  await env.MEDIA.put(fixtureDocumentObjectKey, fixtureBody, {
    httpMetadata: { contentType: "text/plain" },
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO projects
       (id, founder_user_id, slug, title, summary, description, stage, seeking, status)
       VALUES (?, ?, ?, 'Launch Gate Project', 'Permission-bound project fixture.',
               'Used only by isolated launch-gate tests.', 'prototype',
               'Test evidence only', 'published')`,
    ).bind(projectId, founderUserId, fixtureProjectSlug),
    env.DB.prepare(
      `INSERT INTO project_documents
       (id, project_id, uploaded_by, title, object_key, content_type, byte_size)
       VALUES (?, ?, ?, 'Launch Gate Diligence.txt', ?, 'text/plain', ?)`,
    ).bind(
      documentId,
      projectId,
      founderUserId,
      fixtureDocumentObjectKey,
      fixtureBody.length,
    ),
    env.DB.prepare(
      `INSERT INTO document_access_grants
       (id, project_id, document_id, investor_user_id, granted_by,
        can_download, starts_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-1 day'), datetime('now', '+7 days'))`,
    ).bind(
      crypto.randomUUID(),
      projectId,
      documentId,
      grantedInvestor.id,
      founderUserId,
    ),
    env.DB.prepare(
      `INSERT INTO document_access_grants
       (id, project_id, document_id, investor_user_id, granted_by,
        can_download, starts_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now', '-10 days'), datetime('now', '-1 day'))`,
    ).bind(
      crypto.randomUUID(),
      projectId,
      documentId,
      expiredInvestor.id,
      founderUserId,
    ),
    env.DB.prepare(
      `INSERT INTO ambassador_campaigns
       (id, project_id, created_by, slug, title, summary, brief, deliverables,
        compensation, application_deadline, status, campaign_kind, budget_cents,
        currency, registration_opens_at, starts_at, ends_at)
       VALUES (?, ?, ?, ?, 'Launch Gate IIO', 'Ownership-bound campaign fixture.',
               'Automated launch-gate evidence only.', 'One verified test submission.',
               'Recorded external settlement.', datetime('now', '+1 day'), 'published',
               'iio', 100000, 'USD', datetime('now', '-2 days'),
               datetime('now', '-1 day'), datetime('now', '+7 days'))`,
    ).bind(campaignId, projectId, founderUserId, fixtureCampaignSlug),
    env.DB.prepare(
      `INSERT INTO campaign_applications
       (id, campaign_id, creator_user_id, message, status, creator_name,
        payout_cents, final_payout_cents, deliverables_accepted)
       VALUES (?, ?, ?, 'Accepted launch-gate Creator.', 'accepted',
               'Launch Gate Selected Creator', 50000, 45000, 1)`,
    ).bind(selectedApplicationId, campaignId, selectedCreator.id),
    env.DB.prepare(
      `INSERT INTO campaign_applications
       (id, campaign_id, creator_user_id, message, status, creator_name)
       VALUES (?, ?, ?, 'Unselected launch-gate Creator.', 'submitted',
               'Launch Gate Other Creator')`,
    ).bind(crypto.randomUUID(), campaignId, otherCreator.id),
    env.DB.prepare(
      `INSERT INTO campaign_settlements
       (id, campaign_id, application_id, creator_user_id,
        original_allocation_cents, final_amount_cents, settlement_type,
        currency, payment_status, payment_method, internal_note)
       VALUES (?, ?, ?, ?, 50000, 45000, 'cash', 'USD', 'approved',
               'external', 'Automated launch-gate settlement fixture.')`,
    ).bind(
      crypto.randomUUID(),
      campaignId,
      selectedApplicationId,
      selectedCreator.id,
    ),
    env.DB.prepare(
      `INSERT INTO campaign_disputes
       (id, campaign_id, application_id, creator_user_id, dispute_type,
        description, status)
       VALUES (?, ?, ?, ?, 'allocation',
               'Automated launch-gate dispute visible only to its Creator and moderators.',
               'open')`,
    ).bind(
      crypto.randomUUID(),
      campaignId,
      selectedApplicationId,
      selectedCreator.id,
    ),
    env.DB.prepare(
      `INSERT INTO campaign_moderators (campaign_id, user_id, assigned_by)
       VALUES (?, ?, ?)`,
    ).bind(campaignId, moderator.id, founderUserId),
  ]);

  return {
    projectSlug: fixtureProjectSlug,
    documentId,
    campaignSlug: fixtureCampaignSlug,
  };
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });
  const persona = params.persona ?? "";
  const spec = personaSpecs[persona];
  if (!spec) throw new Response("Unknown persona", { status: 400 });

  const form = await request.formData();
  const createPersonaSession = form.get("session") !== "false";
  const seedResources = form.get("seedResources") === "true";
  const reuseExisting = form.get("reuseExisting") === "true";
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const username = `launch-gate-${persona.replaceAll("_", "-")}`;
  const email = `${username}@example.test`;

  if (persona === "project_owner" && !reuseExisting)
    await cleanupLaunchGateResources(env);

  const existing = await db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
  let userId: string;
  if (existing && reuseExisting) userId = existing.id;
  else {
    if (existing)
      await db.prepare("DELETE FROM users WHERE id = ?").bind(existing.id).run();

    userId = crypto.randomUUID();
    const passwordHash = await hashPassword("Launch-gate-test-password-2026");
    const visibility = spec.privateProfile ? "private" : "members";
    const avatarKey = spec.privateProfile
      ? `launch-gate/${username}.txt`
      : null;
    const statements = [
      db
        .prepare(
          `INSERT INTO users
           (id, email, username, password_hash, status, email_verified_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        )
        .bind(userId, email, username, passwordHash, spec.status),
      db
        .prepare(
          `INSERT INTO profiles (user_id, display_name, visibility, avatar_key)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          userId,
          `Launch Gate ${persona.replaceAll("_", " ")}`,
          visibility,
          avatarKey,
        ),
      db
        .prepare(
          `INSERT INTO profile_visibility (user_id, visibility) VALUES (?, ?)`,
        )
        .bind(userId, visibility),
      db
        .prepare(
          `INSERT INTO membership_applications
           (id, user_id, status, applicant_note)
           VALUES (?, ?, ?, 'Automated launch-gate fixture account.')`,
        )
        .bind(crypto.randomUUID(), userId, spec.membership),
      ...spec.roles.map((role) =>
        db
          .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
          .bind(userId, role),
      ),
      ...spec.roles.map((role) =>
        db
          .prepare(
            `INSERT INTO role_verifications
             (user_id, role, status, reviewed_at)
             VALUES (?, ?, 'verified', datetime('now'))`,
          )
          .bind(userId, role),
      ),
    ];
    await db.batch(statements);

    if (avatarKey)
      await env.MEDIA.put(avatarKey, "private launch-gate fixture", {
        httpMetadata: { contentType: "text/plain" },
      });

    if (spec.admin === "superadmin")
      await db
        .prepare(
          `INSERT INTO admin_users (user_id, access_level)
           VALUES (?, 'superadmin')`,
        )
        .bind(userId)
        .run();
    else if (spec.admin) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO admin_users (user_id, access_level) VALUES (?, 'admin')`,
          )
          .bind(userId),
        db
          .prepare(
            `INSERT INTO admin_scopes (admin_user_id, scope, granted_by)
             VALUES (?, ?, ?)`,
          )
          .bind(userId, spec.admin, userId),
      ]);
    }
  }

  const resources =
    persona === "project_owner" && seedResources
      ? await seedLaunchGateResources(env, userId)
      : null;

  let cookie: string | null = null;
  if (createPersonaSession) cookie = await createSession(db, userId, request);
  if (spec.invalidateSession)
    await db
      .prepare("DELETE FROM sessions WHERE user_id = ?")
      .bind(userId)
      .run();

  return new Response(
    JSON.stringify({
      persona,
      userId,
      username,
      session: Boolean(cookie),
      resources,
    }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    },
  );
}
