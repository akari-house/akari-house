import {
  createOrRefreshIioSheet,
  importIioSheetReviews,
  type GoogleSheetApplicant,
  type GoogleSheetCampaign,
} from "./google-sheets.server";

export type GoogleExportResult = { providerResponseId?: string };

function parseReference(reference: string) {
  const [provider, operation, campaignId, userId] = reference.split(":");
  if (
    provider !== "google" ||
    !["sync", "import"].includes(operation ?? "") ||
    !campaignId ||
    !userId
  )
    throw new Error("Google export reference is invalid.");
  return { operation: operation as "sync" | "import", campaignId, userId };
}

async function requireCampaignExportAccess(db: D1Database, userId: string) {
  const access = await db
    .prepare(
      `SELECT 1 AS allowed FROM admin_users admins
       JOIN users ON users.id = admins.user_id AND users.status = 'active'
       LEFT JOIN admin_scopes scopes
         ON scopes.admin_user_id = admins.user_id AND scopes.scope = 'campaigns'
       WHERE admins.user_id = ?
         AND (admins.access_level = 'superadmin' OR scopes.scope = 'campaigns')`,
    )
    .bind(userId)
    .first<{ allowed: number }>();
  if (!access)
    throw new Error("Campaign export access is no longer available.");
}

async function loadCampaign(
  db: D1Database,
  campaignId: string,
): Promise<GoogleSheetCampaign & { finalizedAt: string | null }> {
  const campaign = await db
    .prepare(
      `SELECT campaigns.id, campaigns.slug, campaigns.title,
              projects.title AS projectTitle,
              campaigns.budget_cents AS budgetCents, campaigns.currency,
              campaigns.weight_followers AS weightFollowers,
              campaigns.weight_x_score AS weightXScore,
              campaigns.weight_sorsa_score AS weightSorsaScore,
              campaigns.finalized_at AS finalizedAt
       FROM ambassador_campaigns campaigns
       JOIN projects ON projects.id = campaigns.project_id
       WHERE campaigns.id = ? AND campaigns.campaign_kind = 'iio'`,
    )
    .bind(campaignId)
    .first<GoogleSheetCampaign & { finalizedAt: string | null }>();
  if (!campaign) throw new Error("IIO campaign no longer exists.");
  return campaign;
}

async function loadApplicants(db: D1Database, campaignId: string) {
  const applicants = await db
    .prepare(
      `SELECT applications.id,
              COALESCE(NULLIF(applications.creator_name, ''), profiles.display_name)
                AS creatorName,
              applications.x_url AS xUrl,
              applications.tiktok_url AS tiktokUrl,
              applications.instagram_url AS instagramUrl,
              applications.youtube_url AS youtubeUrl,
              applications.x_followers AS xFollowers,
              applications.x_score AS xScore,
              applications.sorsa_score AS sorsaScore,
              applications.status
       FROM campaign_applications applications
       JOIN profiles ON profiles.user_id = applications.creator_user_id
       WHERE applications.campaign_id = ? AND applications.status <> 'withdrawn'
       ORDER BY applications.created_at`,
    )
    .bind(campaignId)
    .all<GoogleSheetApplicant>();
  return applicants.results;
}

export async function executeGoogleExportDelivery(
  env: CloudflareEnvironment,
  messageType: string,
  payloadReference: string | null,
): Promise<GoogleExportResult> {
  if (!payloadReference) throw new Error("Google export payload is missing.");
  const reference = parseReference(payloadReference);
  const expectedType =
    reference.operation === "sync"
      ? "google_sheet_sync"
      : "google_sheet_import";
  if (messageType !== expectedType)
    throw new Error("Google export operation does not match its message type.");

  await requireCampaignExportAccess(env.DB, reference.userId);
  const campaign = await loadCampaign(env.DB, reference.campaignId);

  if (reference.operation === "sync") {
    const applicants = await loadApplicants(env.DB, campaign.id);
    const sheet = await createOrRefreshIioSheet(
      env.DB,
      reference.userId,
      campaign,
      applicants,
      env,
    );
    await env.DB.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, 'iio.google_sheet_synced', 'campaign', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        reference.userId,
        campaign.id,
        JSON.stringify({
          spreadsheetId: sheet.spreadsheetId,
          delivery: "outbox",
        }),
      )
      .run();
    return { providerResponseId: sheet.spreadsheetId };
  }

  if (campaign.finalizedAt)
    throw new Error("Finalized campaign decisions cannot be imported.");
  const imported = await importIioSheetReviews(
    env.DB,
    reference.userId,
    campaign.id,
    env,
  );
  await env.DB.prepare(
    `INSERT INTO audit_logs
     (id, actor_user_id, action, subject_type, subject_id, metadata_json)
     VALUES (?, ?, 'iio.google_sheet_imported', 'campaign', ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      reference.userId,
      campaign.id,
      JSON.stringify({ imported, delivery: "outbox" }),
    )
    .run();
  return { providerResponseId: `imported:${imported}` };
}
