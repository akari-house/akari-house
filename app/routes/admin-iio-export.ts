import type { Route } from "./+types/admin-iio-export";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireAdminScope } from "~/lib/membership.server";

function csvCell(value: string | number | null | undefined, formula = false) {
  let text = String(value ?? "");
  if (!formula && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await requireAdminScope(request, db, "campaigns");
  const campaign = await db
    .prepare(
      `SELECT id, slug, title, budget_cents AS budgetCents, currency,
              weight_followers AS weightFollowers,
              weight_x_score AS weightXScore,
              weight_sorsa_score AS weightSorsaScore
       FROM ambassador_campaigns
       WHERE slug = ? AND campaign_kind = 'iio'`,
    )
    .bind(params.slug)
    .first<{
      id: string;
      slug: string;
      title: string;
      budgetCents: number;
      currency: string;
      weightFollowers: number;
      weightXScore: number;
      weightSorsaScore: number;
    }>();
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const applications = await db
    .prepare(
      `SELECT COALESCE(NULLIF(ca.creator_name, ''), p.display_name) AS creatorName,
              ca.x_url AS xUrl, ca.tiktok_url AS tiktokUrl,
              ca.instagram_url AS instagramUrl, ca.youtube_url AS youtubeUrl,
              ca.x_followers AS xFollowers, ca.x_score AS xScore,
              ca.sorsa_score AS sorsaScore, ca.status,
              ca.akari_score AS akariScore,
              ca.payout_percent AS payoutPercent,
              ca.payout_cents AS payoutCents
       FROM campaign_applications ca
       JOIN users u ON u.id = ca.creator_user_id
       JOIN profiles p ON p.user_id = ca.creator_user_id
       WHERE ca.campaign_id = ? AND ca.status <> 'withdrawn'
       ORDER BY ca.created_at`,
    )
    .bind(campaign.id)
    .all<Record<string, string | number>>();
  const headers = [
    "Creator",
    "X",
    "TikTok",
    "Instagram",
    "YouTube",
    "X Followers",
    "XScore",
    "Sorsa Score",
    "Decision",
    "Follower Percentile",
    "XScore Percentile",
    "Sorsa Percentile",
    "AKARI Score",
    "Distribution %",
    `Payout (${campaign.currency})`,
  ];
  const lastRow = applications.results.length + 1;
  const rows = applications.results.map((item, index) => {
    const row = index + 2;
    const selected = `$I${row}="accepted"`;
    const followerPercentile = `=IF(${selected},IFERROR(PERCENTRANK(FILTER($F$2:$F$${lastRow},$I$2:$I$${lastRow}="accepted"),F${row}),1),0)`;
    const xPercentile = `=IF(${selected},IFERROR(PERCENTRANK(FILTER($G$2:$G$${lastRow},$I$2:$I$${lastRow}="accepted"),G${row}),1),0)`;
    const sorsaPercentile = `=IF(${selected},IFERROR(PERCENTRANK(FILTER($H$2:$H$${lastRow},$I$2:$I$${lastRow}="accepted"),H${row}),1),0)`;
    const score = `=IF(${selected},MAX(0.05,J${row}*${campaign.weightFollowers / 100}+K${row}*${campaign.weightXScore / 100}+L${row}*${campaign.weightSorsaScore / 100}),0)`;
    const share = `=IFERROR(M${row}/SUM($M$2:$M$${lastRow}),0)`;
    const payout = `=ROUND(N${row}*${campaign.budgetCents / 100},2)`;
    return [
      item.creatorName,
      item.xUrl,
      item.tiktokUrl,
      item.instagramUrl,
      item.youtubeUrl,
      item.xFollowers,
      item.xScore,
      item.sorsaScore,
      item.status,
      followerPercentile,
      xPercentile,
      sorsaPercentile,
      score,
      share,
      payout,
    ]
      .map((value, column) => csvCell(value, column >= 9))
      .join(",");
  });
  const csv = [
    headers.map((value) => csvCell(value)).join(","),
    ...rows,
    "",
    [
      csvCell("Private campaign budget"),
      csvCell(
        `${campaign.currency} ${(campaign.budgetCents / 100).toFixed(2)}`,
      ),
    ].join(","),
    [
      csvCell("Formula weights"),
      csvCell(
        `Followers ${campaign.weightFollowers}% / XScore ${campaign.weightXScore}% / Sorsa ${campaign.weightSorsaScore}%`,
      ),
    ].join(","),
  ].join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-iio.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
