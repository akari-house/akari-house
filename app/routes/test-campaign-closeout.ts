import type { Route } from "./+types/test-campaign-closeout";
import { cloudflareContext } from "~/lib/cloudflare-context";

const fixtureHeader = "launch-gate-v1";
const campaignSlug = "launch-gate-closeout";
const projectSlug = "launch-gate-closeout-project";

function allowFixtureRequest(request: Request) {
  const url = new URL(request.url);
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    request.headers.get("x-akari-test-fixture") === fixtureHeader
  );
}

async function userId(db: D1Database, username: string) {
  return db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
}

async function cleanup(db: D1Database) {
  const campaign = await db
    .prepare("SELECT id FROM ambassador_campaigns WHERE slug = ?")
    .bind(campaignSlug)
    .first<{ id: string }>();
  if (!campaign) return;
  await db.batch([
    db
      .prepare(
        `DELETE FROM campaign_settlement_adjustments
         WHERE settlement_id IN (
           SELECT id FROM campaign_settlements WHERE campaign_id = ?
         )`,
      )
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_closeouts WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_final_reports WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_disputes WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_settlements WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_creator_bonuses WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare(
        "DELETE FROM campaign_content_metric_snapshots WHERE campaign_id = ?",
      )
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_content_items WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_work_submissions WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM campaign_applications WHERE campaign_id = ?")
      .bind(campaign.id),
    db
      .prepare("DELETE FROM ambassador_campaigns WHERE id = ?")
      .bind(campaign.id),
  ]);
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });
  if (params.action !== "seed")
    throw new Response("Unknown fixture action", { status: 400 });

  const db = context.get(cloudflareContext).env.DB;
  const [founder, creator, superadmin] = await Promise.all([
    userId(db, "launch-gate-founder"),
    userId(db, "launch-gate-creator-selected"),
    userId(db, "launch-gate-superadmin"),
  ]);
  if (!founder || !creator || !superadmin)
    throw new Response("Create R69 fixture personas first.", { status: 409 });

  await cleanup(db);
  const existingProject = await db
    .prepare("SELECT id FROM projects WHERE slug = ?")
    .bind(projectSlug)
    .first<{ id: string }>();
  const projectId = existingProject?.id ?? crypto.randomUUID();
  const campaignId = crypto.randomUUID();
  const applicationId = crypto.randomUUID();
  const contentId = crypto.randomUUID();

  const statements: D1PreparedStatement[] = [];
  if (!existingProject)
    statements.push(
      db
        .prepare(
          `INSERT INTO projects
           (id, founder_user_id, slug, title, summary, description, stage,
            seeking, status)
           VALUES (?, ?, ?, 'R69 Closeout Project',
                   'Isolated campaign closeout fixture.',
                   'Used only by automated R69 browser validation.',
                   'prototype', 'Campaign closeout validation', 'published')`,
        )
        .bind(projectId, founder.id, projectSlug),
    );

  statements.push(
    db
      .prepare(
        `INSERT INTO ambassador_campaigns
         (id, project_id, created_by, slug, title, summary, brief, deliverables,
          compensation, application_deadline, status, campaign_kind,
          budget_cents, bonus_pool_cents, maximum_bonus_per_creator_cents,
          maximum_allocation_cents, currency, registration_opens_at,
          starts_at, ends_at, roster_finalized_at, roster_finalized_by)
         VALUES (?, ?, ?, ?, 'R69 Closeout Campaign',
                 'Standard Ambassador Campaign used by isolated closeout tests.',
                 'Validate the complete R69 operating loop.',
                 'One approved test post.', 'Recorded external payment.',
                 date('now', '-8 days'), 'published', 'ambassador',
                 60000, 10000, 10000, 50000, 'USD', date('now', '-12 days'),
                 date('now', '-7 days'), date('now', '-1 day'),
                 datetime('now', '-7 days'), ?)`,
      )
      .bind(campaignId, projectId, founder.id, campaignSlug, superadmin.id),
    db
      .prepare(
        `INSERT INTO campaign_applications
         (id, campaign_id, creator_user_id, message, status, creator_name,
          payout_cents, final_payout_cents, deliverables_accepted,
          metrics_status, accepted_at)
         VALUES (?, ?, ?, 'Accepted R69 fixture Creator.', 'accepted',
                 'Launch Gate Selected Creator', 50000, 45000, 1,
                 'verified', datetime('now', '-7 days'))`,
      )
      .bind(applicationId, campaignId, creator.id),
    db
      .prepare(
        `INSERT INTO campaign_content_items
         (id, campaign_id, application_id, creator_user_id, platform,
          work_url, published_at, status, reviewed_by, reviewed_at)
         VALUES (?, ?, ?, ?, 'x', 'https://x.com/example/status/16969',
                 date('now', '-2 days'), 'approved', ?, datetime('now', '-1 day'))`,
      )
      .bind(contentId, campaignId, applicationId, creator.id, superadmin.id),
    db
      .prepare(
        `INSERT INTO campaign_content_metric_snapshots
         (id, content_item_id, campaign_id, application_id, creator_user_id,
          platform, views, likes, comments, reposts, bookmarks, clicks,
          source, verification_note, is_final, captured_by)
         VALUES (?, ?, ?, ?, ?, 'x', 10000, 700, 90, 120, 60, 140,
                 'manual', 'R69 final metric fixture.', 1, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        contentId,
        campaignId,
        applicationId,
        creator.id,
        superadmin.id,
      ),
    db
      .prepare(
        `INSERT INTO campaign_creator_bonuses
         (id, campaign_id, application_id, creator_user_id, amount_cents,
          bonus_type, reason, status, proposed_by, approved_by, approved_at)
         VALUES (?, ?, ?, ?, 5000, 'Content quality',
                 'Approved R69 fixture performance bonus.', 'approved',
                 ?, ?, datetime('now', '-1 day'))`,
      )
      .bind(
        crypto.randomUUID(),
        campaignId,
        applicationId,
        creator.id,
        superadmin.id,
        superadmin.id,
      ),
  );

  await db.batch(statements);
  return Response.json({ campaignSlug }, { status: 201 });
}
