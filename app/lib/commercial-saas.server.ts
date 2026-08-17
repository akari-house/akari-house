import { invoiceCollectionState, type InvoiceStatus } from "./commercial-saas";

export async function clearedInvoiceNetCents(
  db: D1Database,
  invoiceId: string,
) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents - refunded_amount_cents), 0) AS amountCents
       FROM commercial_payments
       WHERE invoice_id = ? AND status = 'cleared'`,
    )
    .bind(invoiceId)
    .first<{ amountCents: number }>();
  return Number(row?.amountCents ?? 0);
}

export async function refreshInvoiceCollectionStatus(
  db: D1Database,
  invoiceId: string,
  updatedBy: string | null,
) {
  const invoice = await db
    .prepare(
      `SELECT status, total_cents AS totalCents
       FROM commercial_invoices WHERE id = ?`,
    )
    .bind(invoiceId)
    .first<{ status: InvoiceStatus; totalCents: number }>();
  if (!invoice) throw new Response("Invoice not found.", { status: 404 });
  const clearedNetCents = await clearedInvoiceNetCents(db, invoiceId);
  const nextStatus = invoiceCollectionState(
    invoice.status,
    invoice.totalCents,
    clearedNetCents,
  );
  if (nextStatus !== invoice.status)
    await db
      .prepare(
        `UPDATE commercial_invoices
         SET status = ?, updated_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(nextStatus, updatedBy, invoiceId)
      .run();
  return { status: nextStatus, clearedNetCents };
}

export async function commercialCurrencySummary(db: D1Database) {
  const result = await db
    .prepare(
      `WITH invoice_cash AS (
         SELECT i.currency,
                COALESCE(SUM(CASE WHEN p.status = 'cleared'
                  THEN p.amount_cents - p.refunded_amount_cents ELSE 0 END), 0) AS collected,
                0 AS outstanding,
                0 AS operating_cost,
                0 AS creator_cost
         FROM commercial_invoices i
         LEFT JOIN commercial_payments p ON p.invoice_id = i.id
         WHERE i.status <> 'void'
         GROUP BY i.currency
       ),
       invoice_ar AS (
         SELECT i.currency, 0 AS collected,
                COALESCE(SUM(MAX(0, i.total_cents - COALESCE((
                  SELECT SUM(p.amount_cents - p.refunded_amount_cents)
                  FROM commercial_payments p
                  WHERE p.invoice_id = i.id AND p.status = 'cleared'
                ), 0))), 0) AS outstanding,
                0 AS operating_cost, 0 AS creator_cost
         FROM commercial_invoices i
         WHERE i.status IN ('issued', 'partially_paid')
         GROUP BY i.currency
       ),
       operating_cost AS (
         SELECT currency, 0 AS collected, 0 AS outstanding,
                COALESCE(SUM(amount_cents), 0) AS operating_cost, 0 AS creator_cost
         FROM commercial_cost_entries WHERE status = 'paid'
         GROUP BY currency
       ),
       creator_cost AS (
         SELECT currency, 0 AS collected, 0 AS outstanding, 0 AS operating_cost,
                COALESCE(SUM(final_amount_cents), 0) AS creator_cost
         FROM campaign_settlements WHERE payment_status = 'paid'
         GROUP BY currency
       )
       SELECT currency,
              SUM(collected) AS collectedCents,
              SUM(outstanding) AS outstandingCents,
              SUM(operating_cost) AS operatingCostCents,
              SUM(creator_cost) AS creatorCostCents
       FROM (
         SELECT * FROM invoice_cash
         UNION ALL SELECT * FROM invoice_ar
         UNION ALL SELECT * FROM operating_cost
         UNION ALL SELECT * FROM creator_cost
       )
       GROUP BY currency ORDER BY currency`,
    )
    .all<{
      currency: string;
      collectedCents: number;
      outstandingCents: number;
      operatingCostCents: number;
      creatorCostCents: number;
    }>();
  return result.results.map((row) => ({
    ...row,
    grossContributionCents:
      Number(row.collectedCents) -
      Number(row.operatingCostCents) -
      Number(row.creatorCostCents),
  }));
}
