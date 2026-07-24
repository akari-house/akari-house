import type { Route } from "./+types/iio-settlement-export";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureIioSettlementSchema } from "~/lib/iio-settlement-schema.server";
import { requireAdminScope } from "~/lib/membership.server";

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await ensureIioSettlementSchema(db);
  await requireAdminScope(request, db, "campaigns");
  const campaign = await db
    .prepare(
      `SELECT id, slug, title, currency FROM ambassador_campaigns
       WHERE slug = ? AND campaign_kind = 'iio'`,
    )
    .bind(params.slug)
    .first<{ id: string; slug: string; title: string; currency: string }>();
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const rows = await db
    .prepare(
      `SELECT p.display_name AS creatorName, u.username,
              ca.payout_cents AS originalAllocationCents,
              COALESCE(cs.final_amount_cents, ca.final_payout_cents, ca.payout_cents)
                AS finalAmountCents,
              COALESCE(cs.settlement_type, 'cash') AS settlementType,
              cs.token_symbol AS tokenSymbol,
              COALESCE(cs.payment_status, 'pending') AS paymentStatus,
              cs.payment_method AS paymentMethod,
              cs.transaction_reference AS transactionReference,
              cs.evidence_reference AS evidenceReference,
              cs.paid_at AS paidAt,
              (SELECT COUNT(*) FROM campaign_disputes cd
               WHERE cd.application_id = ca.id) AS disputeCount,
              (SELECT COUNT(*) FROM campaign_disputes cd
               WHERE cd.application_id = ca.id
                 AND cd.status IN ('open', 'reviewing')) AS openDisputeCount
       FROM campaign_applications ca
       JOIN users u ON u.id = ca.creator_user_id
       JOIN profiles p ON p.user_id = ca.creator_user_id
       LEFT JOIN campaign_settlements cs ON cs.application_id = ca.id
       WHERE ca.campaign_id = ? AND ca.status = 'accepted'
       ORDER BY p.display_name`,
    )
    .bind(campaign.id)
    .all<Record<string, string | number | null>>();
  const headers = [
    "Creator",
    "Username",
    `Original allocation (${campaign.currency})`,
    `Final amount (${campaign.currency})`,
    "Settlement type",
    "Token symbol",
    "Payment status",
    "Payment method",
    "Transaction reference",
    "Evidence reference",
    "Paid at",
    "Disputes",
    "Open disputes",
  ];
  const csvRows = rows.results.map((row) =>
    [
      row.creatorName,
      row.username,
      (Number(row.originalAllocationCents) / 100).toFixed(2),
      (Number(row.finalAmountCents) / 100).toFixed(2),
      row.settlementType,
      row.tokenSymbol,
      row.paymentStatus,
      row.paymentMethod,
      row.transactionReference,
      row.evidenceReference,
      row.paidAt,
      row.disputeCount,
      row.openDisputeCount,
    ]
      .map(csvCell)
      .join(","),
  );
  return new Response(`\uFEFF${[headers.map(csvCell).join(","), ...csvRows].join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-settlement.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}