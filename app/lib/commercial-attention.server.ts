import {
  attentionKey,
  classifyDueDate,
  type AttentionSignal,
} from "./operating-rhythm";
import { moneyLabel, outstandingInvoiceCents, type InvoiceStatus } from "./commercial-saas";

export async function loadCommercialAttentionSignals(
  db: D1Database,
  now = new Date(),
): Promise<AttentionSignal[]> {
  const [invoices, subscriptions] = await Promise.all([
    db
      .prepare(
        `SELECT i.id, i.invoice_number AS invoiceNumber, i.customer_name AS customerName,
                i.currency, i.total_cents AS totalCents, i.status, i.due_at AS dueAt,
                i.owner_user_id AS ownerUserId, i.project_id AS projectId,
                COALESCE((SELECT SUM(cp.amount_cents - cp.refunded_amount_cents)
                  FROM commercial_payments cp
                  WHERE cp.invoice_id = i.id AND cp.status = 'cleared'), 0) AS clearedNetCents
         FROM commercial_invoices i
         WHERE i.status IN ('issued', 'partially_paid') AND i.due_at IS NOT NULL`,
      )
      .all<{
        id: string;
        invoiceNumber: string;
        customerName: string;
        currency: string;
        totalCents: number;
        status: InvoiceStatus;
        dueAt: string;
        ownerUserId: string | null;
        projectId: string | null;
        clearedNetCents: number;
      }>(),
    db
      .prepare(
        `SELECT s.workspace_id AS id, w.name AS workspaceName, w.primary_project_id AS projectId,
                s.status, s.trial_ends_at AS trialEndsAt,
                s.current_period_end AS currentPeriodEnd
         FROM saas_workspace_subscriptions s
         JOIN saas_workspaces w ON w.id = s.workspace_id
         WHERE w.status NOT IN ('closed', 'suspended')
           AND s.status IN ('trialing', 'active', 'past_due')`,
      )
      .all<{
        id: string;
        workspaceName: string;
        projectId: string | null;
        status: string;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
      }>(),
  ]);

  const signals: AttentionSignal[] = [];
  for (const invoice of invoices.results) {
    const outstanding = outstandingInvoiceCents(
      Number(invoice.totalCents),
      Number(invoice.clearedNetCents),
    );
    if (outstanding <= 0) continue;
    signals.push({
      attentionKey: attentionKey("invoice", invoice.id, "collection_due"),
      sourceType: "invoice",
      sourceId: invoice.id,
      signalType: "collection_due",
      title: `Invoice collection: ${invoice.invoiceNumber}`,
      detail: `${invoice.customerName} has ${moneyLabel(outstanding, invoice.currency)} outstanding.`,
      actionUrl: "/admin/finance",
      dueAt: invoice.dueAt,
      ownerUserId: invoice.ownerUserId,
      projectId: invoice.projectId,
      severity: classifyDueDate(invoice.dueAt, now),
    });
  }

  for (const subscription of subscriptions.results) {
    const dueAt =
      subscription.status === "trialing"
        ? subscription.trialEndsAt
        : subscription.currentPeriodEnd;
    signals.push({
      attentionKey: attentionKey(
        "workspace_subscription",
        subscription.id,
        subscription.status === "past_due" ? "past_due" : "period_review",
      ),
      sourceType: "workspace_subscription",
      sourceId: subscription.id,
      signalType:
        subscription.status === "past_due" ? "past_due" : "period_review",
      title:
        subscription.status === "past_due"
          ? `Subscription past due: ${subscription.workspaceName}`
          : `Subscription review: ${subscription.workspaceName}`,
      detail:
        subscription.status === "past_due"
          ? "Workspace subscription requires billing follow-up."
          : `Workspace subscription is ${subscription.status}; review the upcoming period boundary.`,
      actionUrl: `/admin/workspaces?workspace=${encodeURIComponent(subscription.id)}`,
      dueAt,
      ownerUserId: null,
      projectId: subscription.projectId,
      severity:
        subscription.status === "past_due"
          ? "overdue"
          : classifyDueDate(dueAt, now),
    });
  }
  return signals;
}
