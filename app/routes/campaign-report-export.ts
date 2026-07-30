import type { Route } from "./+types/campaign-report-export";
import { requireCampaignOperator } from "~/lib/campaign-operations.server";
import { parseCampaignPlatforms } from "~/lib/campaign-compensation";
import { cloudflareContext } from "~/lib/cloudflare-context";

function xmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cell(value: string | number | null | undefined) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`;
}

function row(values: Array<string | number | null | undefined>) {
  return `<Row>${values.map(cell).join("")}</Row>`;
}

function sheet(
  name: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  return `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${row(headers)}${rows.map(row).join("")}</Table></Worksheet>`;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const campaign = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.currency,
              c.registration_opens_at AS registrationOpensAt,
              c.application_deadline AS applicationDeadline,
              c.starts_at AS startsAt, c.ends_at AS endsAt,
              c.budget_cents AS budgetCents,
              c.bonus_pool_cents AS bonusPoolCents,
              c.payment_frequency AS paymentFrequency,
              c.custom_payment_label AS customPaymentLabel,
              p.title AS projectTitle
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.slug = ?`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      currency: string;
      registrationOpensAt: string | null;
      applicationDeadline: string | null;
      startsAt: string | null;
      endsAt: string | null;
      budgetCents: number;
      bonusPoolCents: number;
      paymentFrequency: string;
      customPaymentLabel: string;
      projectTitle: string;
    }>();
  if (!campaign) throw new Response("Campaign not found.", { status: 404 });
  await requireCampaignOperator(request, db, campaign.id);
  const projectView =
    new URL(request.url).searchParams.get("view") === "project";

  const [participants, content, bonuses, applicationCount] = await Promise.all([
    db
      .prepare(
        `SELECT ca.id AS applicationId, p.display_name AS creatorName,
                u.username, ca.selected_platforms_json AS selectedPlatformsJson,
                ca.x_followers AS xFollowers,
                ca.youtube_followers AS youtubeFollowers,
                ca.tiktok_followers AS tiktokFollowers,
                ca.instagram_followers AS instagramFollowers,
                ca.x_score AS xScore, ca.sorsa_score AS sorsaScore,
                ca.akari_score AS selectionScore,
                ca.payout_cents AS expectedPaymentCents,
                COALESCE(ca.final_payout_cents, ca.payout_cents) AS finalPaymentCents,
                ca.posting_days_json AS postingDaysJson
         FROM campaign_applications ca
         JOIN profiles p ON p.user_id = ca.creator_user_id
         JOIN users u ON u.id = ca.creator_user_id
         WHERE ca.campaign_id = ? AND ca.status = 'accepted'
         ORDER BY p.display_name`,
      )
      .bind(campaign.id)
      .all<Record<string, string | number | null>>(),
    db
      .prepare(
        `SELECT ci.application_id AS applicationId,
                p.display_name AS creatorName, u.username, ci.platform,
                ci.work_url AS workUrl, ci.published_at AS publishedAt,
                ci.status, ci.review_note AS reviewNote,
                COALESCE(ms.views, 0) AS views,
                COALESCE(ms.likes, 0) AS likes,
                COALESCE(ms.comments, 0) AS comments,
                COALESCE(ms.reposts, 0) AS reposts,
                COALESCE(ms.bookmarks, 0) AS bookmarks,
                COALESCE(ms.clicks, 0) AS clicks,
                COALESCE(ms.source, '') AS metricSource,
                COALESCE(ms.verification_note, '') AS metricNote,
                ms.captured_at AS metricCapturedAt
         FROM campaign_content_items ci
         JOIN profiles p ON p.user_id = ci.creator_user_id
         JOIN users u ON u.id = ci.creator_user_id
         LEFT JOIN campaign_content_metric_snapshots ms
           ON ms.id = (
             SELECT latest.id FROM campaign_content_metric_snapshots latest
             WHERE latest.content_item_id = ci.id
             ORDER BY latest.is_final DESC, latest.captured_at DESC LIMIT 1
           )
         WHERE ci.campaign_id = ?
         ORDER BY p.display_name, ci.published_at`,
      )
      .bind(campaign.id)
      .all<Record<string, string | number | null>>(),
    db
      .prepare(
        `SELECT application_id AS applicationId,
                COALESCE(SUM(CASE WHEN status IN ('approved','paid')
                  THEN amount_cents ELSE 0 END), 0) AS bonusCents
         FROM campaign_creator_bonuses WHERE campaign_id = ?
         GROUP BY application_id`,
      )
      .bind(campaign.id)
      .all<{ applicationId: string; bonusCents: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM campaign_applications
         WHERE campaign_id = ? AND status <> 'withdrawn'`,
      )
      .bind(campaign.id)
      .first<{ count: number }>(),
  ]);

  const bonusMap = new Map(
    bonuses.results.map((bonus) => [bonus.applicationId, bonus.bonusCents]),
  );
  const contentByApplication = new Map<string, typeof content.results>();
  for (const item of content.results) {
    const id = String(item.applicationId);
    const existing = contentByApplication.get(id) ?? [];
    existing.push(item);
    contentByApplication.set(id, existing);
  }
  const totalViews = content.results.reduce(
    (sum, item) => sum + Number(item.views ?? 0),
    0,
  );
  const totalLikes = content.results.reduce(
    (sum, item) => sum + Number(item.likes ?? 0),
    0,
  );
  const totalComments = content.results.reduce(
    (sum, item) => sum + Number(item.comments ?? 0),
    0,
  );
  const totalReposts = content.results.reduce(
    (sum, item) => sum + Number(item.reposts ?? 0),
    0,
  );
  const totalBookmarks = content.results.reduce(
    (sum, item) => sum + Number(item.bookmarks ?? 0),
    0,
  );
  const totalEngagements =
    totalLikes + totalComments + totalReposts + totalBookmarks;
  const totalBonuses = bonuses.results.reduce(
    (sum, bonus) => sum + bonus.bonusCents,
    0,
  );
  const totalExpectedPayments = participants.results.reduce(
    (sum, participant) => sum + Number(participant.expectedPaymentCents ?? 0),
    0,
  );

  const summaryRows: Array<Array<string | number | null | undefined>> = [
    ["Campaign", campaign.title],
    ["Project", campaign.projectTitle],
    ["Summary", campaign.summary],
    ["Registration opens", campaign.registrationOpensAt],
    ["Registration closes", campaign.applicationDeadline],
    ["Campaign starts", campaign.startsAt],
    ["Campaign ends", campaign.endsAt],
    ["Applications", applicationCount?.count ?? 0],
    ["Accepted Creators", participants.results.length],
    ["Submitted content", content.results.length],
    ["Total views", totalViews],
    ["Total likes", totalLikes],
    ["Total comments", totalComments],
    ["Total reposts / shares", totalReposts],
    ["Total bookmarks / saves", totalBookmarks],
    ["Total engagements", totalEngagements],
    [
      "Overall engagement rate",
      totalViews
        ? Number(((totalEngagements / totalViews) * 100).toFixed(4))
        : 0,
    ],
  ];
  if (!projectView)
    summaryRows.push(
      ["Currency", campaign.currency],
      ["Total campaign budget", campaign.budgetCents / 100],
      ["Reserved bonus pool", campaign.bonusPoolCents / 100],
      ["Base expected payments", totalExpectedPayments / 100],
      ["Bonuses awarded", totalBonuses / 100],
      [
        "Current potential payable",
        (totalExpectedPayments + totalBonuses) / 100,
      ],
    );

  const creatorHeaders = [
    "Creator",
    "Username",
    "Campaign platforms",
    "X followers",
    "YouTube subscribers",
    "TikTok followers",
    "Instagram followers",
    "XScore",
    "Sorsa score",
    "Selection score",
    "Content submitted",
    "Content approved",
    "Views",
    "Likes",
    "Comments",
    "Reposts / shares",
    "Bookmarks / saves",
    "Engagement rate %",
  ];
  if (!projectView)
    creatorHeaders.push(
      `Expected payment (${campaign.currency})`,
      `Bonus (${campaign.currency})`,
      `Current final amount (${campaign.currency})`,
    );
  const creatorRows = participants.results.map((participant) => {
    const items =
      contentByApplication.get(String(participant.applicationId)) ?? [];
    const views = items.reduce((sum, item) => sum + Number(item.views ?? 0), 0);
    const likes = items.reduce((sum, item) => sum + Number(item.likes ?? 0), 0);
    const comments = items.reduce(
      (sum, item) => sum + Number(item.comments ?? 0),
      0,
    );
    const reposts = items.reduce(
      (sum, item) => sum + Number(item.reposts ?? 0),
      0,
    );
    const bookmarks = items.reduce(
      (sum, item) => sum + Number(item.bookmarks ?? 0),
      0,
    );
    const engagements = likes + comments + reposts + bookmarks;
    const bonusCents = bonusMap.get(String(participant.applicationId)) ?? 0;
    const values: Array<string | number | null | undefined> = [
      participant.creatorName,
      participant.username,
      parseCampaignPlatforms(String(participant.selectedPlatformsJson)).join(
        ", ",
      ),
      Number(participant.xFollowers ?? 0),
      Number(participant.youtubeFollowers ?? 0),
      Number(participant.tiktokFollowers ?? 0),
      Number(participant.instagramFollowers ?? 0),
      Number(participant.xScore ?? 0),
      Number(participant.sorsaScore ?? 0),
      Number(participant.selectionScore ?? 0),
      items.length,
      items.filter((item) => item.status === "approved").length,
      views,
      likes,
      comments,
      reposts,
      bookmarks,
      views ? Number(((engagements / views) * 100).toFixed(4)) : 0,
    ];
    if (!projectView)
      values.push(
        Number(participant.expectedPaymentCents ?? 0) / 100,
        bonusCents / 100,
        (Number(participant.finalPaymentCents ?? 0) + bonusCents) / 100,
      );
    return values;
  });

  const contentRows = content.results.map((item) => {
    const views = Number(item.views ?? 0);
    const engagements =
      Number(item.likes ?? 0) +
      Number(item.comments ?? 0) +
      Number(item.reposts ?? 0) +
      Number(item.bookmarks ?? 0);
    return [
      item.creatorName,
      item.username,
      item.platform,
      item.workUrl,
      item.publishedAt,
      item.status,
      views,
      Number(item.likes ?? 0),
      Number(item.comments ?? 0),
      Number(item.reposts ?? 0),
      Number(item.bookmarks ?? 0),
      Number(item.clicks ?? 0),
      views ? Number(((engagements / views) * 100).toFixed(4)) : 0,
      item.metricSource,
      item.metricCapturedAt,
      item.reviewNote,
      item.metricNote,
    ];
  });

  const worksheets = [
    sheet("Campaign Summary", ["Metric", "Value"], summaryRows),
    sheet("Creator Performance", creatorHeaders, creatorRows),
    sheet(
      "Submitted Content",
      [
        "Creator",
        "Username",
        "Platform",
        "Post URL",
        "Published date",
        "Review status",
        "Views",
        "Likes",
        "Comments",
        "Reposts / shares",
        "Bookmarks / saves",
        "Clicks",
        "Engagement rate %",
        "Metric source",
        "Metric captured at",
        "Content review note",
        "Metric verification note",
      ],
      contentRows,
    ),
  ];
  if (!projectView)
    worksheets.push(
      sheet(
        "Payments",
        [
          "Creator",
          "Username",
          `Base allocation (${campaign.currency})`,
          `Bonus (${campaign.currency})`,
          `Current final amount (${campaign.currency})`,
          "Payment frequency",
        ],
        participants.results.map((participant) => {
          const bonusCents =
            bonusMap.get(String(participant.applicationId)) ?? 0;
          return [
            participant.creatorName,
            participant.username,
            Number(participant.expectedPaymentCents ?? 0) / 100,
            bonusCents / 100,
            (Number(participant.finalPaymentCents ?? 0) + bonusCents) / 100,
            campaign.paymentFrequency === "custom"
              ? campaign.customPaymentLabel
              : campaign.paymentFrequency,
          ];
        }),
      ),
    );

  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets.join("")}</Workbook>`;
  const suffix = projectView ? "project-report" : "internal-report";
  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-${suffix}.xls"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
