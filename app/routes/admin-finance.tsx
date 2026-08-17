import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-finance";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import {
  commercialCostCategories,
  commercialCostStatuses,
  isCommercialCostCategory,
  isCommercialCostStatus,
  isPaymentStatus,
  moneyLabel,
  normalizeCurrency,
  outstandingInvoiceCents,
  type InvoiceStatus,
} from "~/lib/commercial-saas";
import {
  commercialCurrencySummary,
  refreshInvoiceCollectionStatus,
} from "~/lib/commercial-saas.server";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeEmail, validateEmail } from "~/lib/validation";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  workspaceId: string | null;
  workspaceName: string | null;
  projectId: string | null;
  projectTitle: string | null;
  campaignId: string | null;
  campaignTitle: string | null;
  agreementId: string | null;
  agreementTitle: string | null;
  customerName: string;
  customerEmail: string;
  currency: string;
  totalCents: number;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueAt: string | null;
  externalInvoiceUrl: string;
  externalReference: string;
  note: string;
  ownerUserId: string | null;
  ownerName: string;
  clearedNetCents: number;
};

type PaymentRow = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  refundedAmountCents: number;
  currency: string;
  status: string;
  paymentMethod: string;
  externalReference: string;
  paidAt: string | null;
  createdAt: string;
};

type CostRow = {
  id: string;
  description: string;
  category: string;
  amountCents: number;
  currency: string;
  status: string;
  projectTitle: string | null;
  workspaceName: string | null;
  incurredAt: string | null;
  externalReference: string;
};

type Option = { id: string; label: string };

type OwnerOption = { id: string; label: string };

function cents(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function dateValue(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function httpsUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isOverdue(invoice: InvoiceRow) {
  if (!invoice.dueAt || !["issued", "partially_paid"].includes(invoice.status))
    return false;
  return invoice.dueAt < new Date().toISOString().slice(0, 10);
}

export const meta: Route.MetaFunction = () => [
  { title: "Finance | AKARI House" },
  {
    name: "description",
    content: "Internal invoices, collections, costs and commercial reporting.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const url = new URL(request.url);
  const status = formText(url.searchParams.get("status")).trim();
  const currency = formText(url.searchParams.get("currency"))
    .trim()
    .toUpperCase();

  const [
    invoices,
    payments,
    costs,
    projects,
    campaigns,
    agreements,
    workspaces,
    owners,
    summary,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT i.id, i.invoice_number AS invoiceNumber,
                  i.workspace_id AS workspaceId, w.name AS workspaceName,
                  i.project_id AS projectId, p.title AS projectTitle,
                  i.campaign_id AS campaignId, c.title AS campaignTitle,
                  i.agreement_id AS agreementId, a.title AS agreementTitle,
                  i.customer_name AS customerName, i.customer_email AS customerEmail,
                  i.currency, i.total_cents AS totalCents, i.status,
                  i.issued_at AS issuedAt, i.due_at AS dueAt,
                  i.external_invoice_url AS externalInvoiceUrl,
                  i.external_reference AS externalReference, i.note,
                  i.owner_user_id AS ownerUserId,
                  COALESCE(op.display_name, ou.username, 'Unassigned') AS ownerName,
                  COALESCE((SELECT SUM(cp.amount_cents - cp.refunded_amount_cents)
                    FROM commercial_payments cp
                    WHERE cp.invoice_id = i.id AND cp.status = 'cleared'), 0) AS clearedNetCents
           FROM commercial_invoices i
           LEFT JOIN saas_workspaces w ON w.id = i.workspace_id
           LEFT JOIN projects p ON p.id = i.project_id
           LEFT JOIN ambassador_campaigns c ON c.id = i.campaign_id
           LEFT JOIN agreement_records a ON a.id = i.agreement_id
           LEFT JOIN users ou ON ou.id = i.owner_user_id
           LEFT JOIN profiles op ON op.user_id = ou.id
           WHERE (? = '' OR i.status = ?)
             AND (? = '' OR i.currency = ?)
           ORDER BY CASE WHEN i.due_at IS NULL THEN 1 ELSE 0 END, i.due_at, i.updated_at DESC
           LIMIT 250`,
      )
      .bind(status, status, currency, currency)
      .all<InvoiceRow>(),
    db
      .prepare(
        `SELECT cp.id, cp.invoice_id AS invoiceId, i.invoice_number AS invoiceNumber,
                  cp.amount_cents AS amountCents,
                  cp.refunded_amount_cents AS refundedAmountCents,
                  cp.currency, cp.status, cp.payment_method AS paymentMethod,
                  cp.external_reference AS externalReference, cp.paid_at AS paidAt,
                  cp.created_at AS createdAt
           FROM commercial_payments cp
           JOIN commercial_invoices i ON i.id = cp.invoice_id
           ORDER BY cp.created_at DESC LIMIT 80`,
      )
      .all<PaymentRow>(),
    db
      .prepare(
        `SELECT ce.id, ce.description, ce.category, ce.amount_cents AS amountCents,
                  ce.currency, ce.status, p.title AS projectTitle,
                  w.name AS workspaceName, ce.incurred_at AS incurredAt,
                  ce.external_reference AS externalReference
           FROM commercial_cost_entries ce
           LEFT JOIN projects p ON p.id = ce.project_id
           LEFT JOIN saas_workspaces w ON w.id = ce.workspace_id
           ORDER BY ce.created_at DESC LIMIT 80`,
      )
      .all<CostRow>(),
    db
      .prepare(
        "SELECT id, title AS label FROM projects ORDER BY title COLLATE NOCASE LIMIT 300",
      )
      .all<Option>(),
    db
      .prepare(
        "SELECT id, title AS label FROM ambassador_campaigns ORDER BY title COLLATE NOCASE LIMIT 300",
      )
      .all<Option>(),
    db
      .prepare(
        "SELECT id, title AS label FROM agreement_records ORDER BY title COLLATE NOCASE LIMIT 300",
      )
      .all<Option>(),
    db
      .prepare(
        "SELECT id, name AS label FROM saas_workspaces WHERE status <> 'closed' ORDER BY name COLLATE NOCASE",
      )
      .all<Option>(),
    db
      .prepare(
        `SELECT u.id, COALESCE(p.display_name, u.username) AS label
           FROM admin_users au JOIN users u ON u.id = au.user_id
           LEFT JOIN profiles p ON p.user_id = u.id
           WHERE u.status = 'active' ORDER BY label COLLATE NOCASE`,
      )
      .all<OwnerOption>(),
    commercialCurrencySummary(db),
  ]);

  return {
    user,
    access,
    invoices: invoices.results,
    payments: payments.results,
    costs: costs.results,
    projects: projects.results,
    campaigns: campaigns.results,
    agreements: agreements.results,
    workspaces: workspaces.results,
    owners: owners.results,
    summary,
    filters: { status, currency },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "create-invoice") {
    const invoiceNumber = formText(form.get("invoiceNumber")).trim();
    const customerName = formText(form.get("customerName")).trim();
    const customerEmail = normalizeEmail(form.get("customerEmail"));
    const currency = normalizeCurrency(formText(form.get("currency")));
    const subtotalCents = cents(form.get("subtotal"));
    const taxCents = cents(form.get("tax"));
    const discountCents = cents(form.get("discount"));
    const dueAt = dateValue(form.get("dueAt"));
    const issued = formText(form.get("issueNow")) === "1";
    const workspaceId = formText(form.get("workspaceId")).trim() || null;
    let projectId = formText(form.get("projectId")).trim() || null;
    const campaignId = formText(form.get("campaignId")).trim() || null;
    const agreementId = formText(form.get("agreementId")).trim() || null;
    const ownerUserId = formText(form.get("ownerUserId")).trim() || null;
    const externalInvoiceUrl = httpsUrl(
      formText(form.get("externalInvoiceUrl")),
    );
    const externalReference = formText(form.get("externalReference"))
      .trim()
      .slice(0, 300);
    const note = formText(form.get("note")).trim().slice(0, 3000);
    if (
      invoiceNumber.length < 2 ||
      invoiceNumber.length > 80 ||
      customerName.length < 2 ||
      customerName.length > 160 ||
      !currency ||
      subtotalCents === null ||
      taxCents === null ||
      discountCents === null ||
      dueAt === undefined ||
      externalInvoiceUrl === null
    )
      return { error: "Check the invoice fields and amounts." };
    if (customerEmail && !validateEmail(customerEmail))
      return { error: "Enter a valid customer email or leave it blank." };
    const totalCents = subtotalCents + taxCents - discountCents;
    if (totalCents < 0)
      return { error: "Discount cannot exceed subtotal plus tax." };
    if (campaignId) {
      const campaign = await db
        .prepare(
          "SELECT project_id AS projectId FROM ambassador_campaigns WHERE id = ?",
        )
        .bind(campaignId)
        .first<{ projectId: string }>();
      if (!campaign) return { error: "Campaign not found." };
      if (projectId && projectId !== campaign.projectId)
        return { error: "Campaign belongs to a different Project." };
      projectId = campaign.projectId;
    }
    if (ownerUserId) {
      const owner = await db
        .prepare("SELECT 1 FROM admin_users WHERE user_id = ?")
        .bind(ownerUserId)
        .first();
      if (!owner) return { error: "Invoice owner must be an AKARI admin." };
    }
    const id = crypto.randomUUID();
    const issuedAt = issued ? new Date().toISOString().slice(0, 10) : null;
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO commercial_invoices
             (id, invoice_number, workspace_id, project_id, campaign_id, agreement_id,
              customer_name, customer_email, currency, subtotal_cents, tax_cents,
              discount_cents, total_cents, status, issued_at, due_at,
              external_invoice_url, external_reference, note, owner_user_id, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            invoiceNumber,
            workspaceId,
            projectId,
            campaignId,
            agreementId,
            customerName,
            customerEmail,
            currency,
            subtotalCents,
            taxCents,
            discountCents,
            totalCents,
            issued ? "issued" : "draft",
            issuedAt,
            dueAt,
            externalInvoiceUrl,
            externalReference,
            note,
            ownerUserId,
            admin.id,
            admin.id,
          ),
        db
          .prepare(
            `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id, metadata_json)
             VALUES (?, ?, 'commercial_invoice.created', 'commercial_invoice', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            admin.id,
            id,
            JSON.stringify({
              invoiceNumber,
              currency,
              totalCents,
              workspaceId,
              projectId,
              campaignId,
            }),
          ),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return { error: "Invoice number already exists." };
      throw error;
    }
    return { saved: true, message: "Invoice created." };
  }

  if (intent === "set-invoice-status") {
    const invoiceId = formText(form.get("invoiceId")).trim();
    const status = formText(form.get("status"));
    if (!invoiceId || !["draft", "issued", "void"].includes(status))
      return { error: "Choose a valid manual invoice stage." };
    await db.batch([
      db
        .prepare(
          `UPDATE commercial_invoices
           SET status = ?, issued_at = CASE WHEN ? = 'issued' THEN COALESCE(issued_at, date('now')) ELSE issued_at END,
               updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(status, status, admin.id, invoiceId),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'commercial_invoice.status_changed', 'commercial_invoice', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          invoiceId,
          JSON.stringify({ status }),
        ),
    ]);
    return { saved: true, message: "Invoice stage updated." };
  }

  if (intent === "record-payment") {
    const invoiceId = formText(form.get("invoiceId")).trim();
    const amountCents = cents(form.get("amount"));
    const status = formText(form.get("status"));
    const paymentMethod = formText(form.get("paymentMethod"))
      .trim()
      .slice(0, 120);
    const externalReference = formText(form.get("externalReference"))
      .trim()
      .slice(0, 300);
    const evidenceUrl = httpsUrl(formText(form.get("evidenceUrl")));
    const paidAt = dateValue(form.get("paidAt"));
    if (
      !invoiceId ||
      !amountCents ||
      !isPaymentStatus(status) ||
      evidenceUrl === null ||
      paidAt === undefined
    )
      return { error: "Check the payment fields." };
    const invoice = await db
      .prepare("SELECT currency, status FROM commercial_invoices WHERE id = ?")
      .bind(invoiceId)
      .first<{ currency: string; status: InvoiceStatus }>();
    if (!invoice || invoice.status === "void")
      return { error: "Invoice cannot receive this payment." };
    const paymentId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO commercial_payments
           (id, invoice_id, amount_cents, currency, status, payment_method,
            external_reference, evidence_url, paid_at, cleared_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'cleared' THEN datetime('now') ELSE NULL END, ?)`,
        )
        .bind(
          paymentId,
          invoiceId,
          amountCents,
          invoice.currency,
          status,
          paymentMethod,
          externalReference,
          evidenceUrl,
          paidAt,
          status,
          admin.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'commercial_payment.recorded', 'commercial_payment', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          paymentId,
          JSON.stringify({
            invoiceId,
            amountCents,
            currency: invoice.currency,
            status,
          }),
        ),
    ]);
    await refreshInvoiceCollectionStatus(db, invoiceId, admin.id);
    return {
      saved: true,
      message: "Payment recorded and invoice collection state refreshed.",
    };
  }

  if (intent === "record-refund") {
    const paymentId = formText(form.get("paymentId")).trim();
    const refundedAmountCents = cents(form.get("refundedAmount"));
    if (!paymentId || refundedAmountCents === null)
      return { error: "Enter a valid refund amount." };
    const payment = await db
      .prepare(
        "SELECT invoice_id AS invoiceId, amount_cents AS amountCents FROM commercial_payments WHERE id = ?",
      )
      .bind(paymentId)
      .first<{ invoiceId: string; amountCents: number }>();
    if (!payment || refundedAmountCents > payment.amountCents)
      return { error: "Refund cannot exceed the recorded payment." };
    await db.batch([
      db
        .prepare(
          "UPDATE commercial_payments SET refunded_amount_cents = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(refundedAmountCents, paymentId),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'commercial_payment.refund_recorded', 'commercial_payment', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          paymentId,
          JSON.stringify({ refundedAmountCents, invoiceId: payment.invoiceId }),
        ),
    ]);
    await refreshInvoiceCollectionStatus(db, payment.invoiceId, admin.id);
    return { saved: true, message: "Refund recorded." };
  }

  if (intent === "record-cost") {
    const description = formText(form.get("description")).trim();
    const category = formText(form.get("category"));
    const amountCents = cents(form.get("amount"));
    const currency = normalizeCurrency(formText(form.get("currency")));
    const status = formText(form.get("status"));
    const projectId = formText(form.get("projectId")).trim() || null;
    const workspaceId = formText(form.get("workspaceId")).trim() || null;
    const campaignId = formText(form.get("campaignId")).trim() || null;
    const incurredAt = dateValue(form.get("incurredAt"));
    const externalReference = formText(form.get("externalReference"))
      .trim()
      .slice(0, 300);
    const evidenceUrl = httpsUrl(formText(form.get("evidenceUrl")));
    const note = formText(form.get("note")).trim().slice(0, 2000);
    if (
      description.length < 2 ||
      description.length > 240 ||
      !amountCents ||
      !currency ||
      !isCommercialCostCategory(category) ||
      !isCommercialCostStatus(status) ||
      incurredAt === undefined ||
      evidenceUrl === null
    )
      return { error: "Check the cost fields." };
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO commercial_cost_entries
           (id, workspace_id, project_id, campaign_id, category, description,
            amount_cents, currency, status, incurred_at, external_reference,
            evidence_url, note, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          workspaceId,
          projectId,
          campaignId,
          category,
          description,
          amountCents,
          currency,
          status,
          incurredAt,
          externalReference,
          evidenceUrl,
          note,
          admin.id,
          admin.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'commercial_cost.recorded', 'commercial_cost', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          id,
          JSON.stringify({
            category,
            amountCents,
            currency,
            status,
            projectId,
            workspaceId,
            campaignId,
          }),
        ),
    ]);
    return { saved: true, message: "Commercial cost recorded." };
  }

  if (intent === "set-cost-status") {
    const costId = formText(form.get("costId")).trim();
    const status = formText(form.get("status"));
    if (!costId || !isCommercialCostStatus(status))
      return { error: "Choose a valid cost stage." };
    await db
      .prepare(
        "UPDATE commercial_cost_entries SET status = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(status, admin.id, costId)
      .run();
    return { saved: true, message: "Cost stage updated." };
  }

  return { error: "Unsupported finance action." };
}

function OptionSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Option[];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue="">
        <option value="">None</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AdminFinance({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const pending = useNavigation().state !== "idle";
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="directory-heading">
          <div>
            <span className="eyebrow">Commercial operations</span>
            <h1>Revenue, collections and cost control.</h1>
            <p>
              Canonical invoice and cash records, grouped by currency. Creator
              payouts continue to come from campaign settlement records.
            </p>
          </div>
        </header>
        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            {actionData.message}
          </p>
        )}

        <section className="admin-stat-grid" aria-label="Commercial summary">
          {loaderData.summary.length === 0 && (
            <article className="status-card">
              <span className="chapter">Ledger</span>
              <strong>No posted cash yet</strong>
            </article>
          )}
          {loaderData.summary.map((row) => (
            <article className="status-card" key={row.currency}>
              <span className="chapter">{row.currency}</span>
              <strong>
                {moneyLabel(row.collectedCents, row.currency)} collected
              </strong>
              <small>
                {moneyLabel(row.outstandingCents, row.currency)} A/R ·{" "}
                {moneyLabel(row.grossContributionCents, row.currency)}{" "}
                contribution
              </small>
            </article>
          ))}
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">New invoice</span>
              <h2>Issue or prepare an invoice</h2>
            </div>
          </div>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="create-invoice" />
            <div className="form-grid two-column-grid">
              <label>
                Invoice number
                <input name="invoiceNumber" maxLength={80} required />
              </label>
              <label>
                Customer
                <input name="customerName" maxLength={160} required />
              </label>
              <label>
                Customer email
                <input name="customerEmail" type="email" maxLength={254} />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  defaultValue="USD"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                Subtotal
                <input
                  name="subtotal"
                  inputMode="decimal"
                  defaultValue="0.00"
                  required
                />
              </label>
              <label>
                Tax
                <input
                  name="tax"
                  inputMode="decimal"
                  defaultValue="0.00"
                  required
                />
              </label>
              <label>
                Discount
                <input
                  name="discount"
                  inputMode="decimal"
                  defaultValue="0.00"
                  required
                />
              </label>
              <label>
                Due date
                <input name="dueAt" type="date" />
              </label>
              <OptionSelect
                name="workspaceId"
                label="Workspace"
                options={loaderData.workspaces}
              />
              <OptionSelect
                name="projectId"
                label="Project"
                options={loaderData.projects}
              />
              <OptionSelect
                name="campaignId"
                label="Campaign"
                options={loaderData.campaigns}
              />
              <OptionSelect
                name="agreementId"
                label="Agreement"
                options={loaderData.agreements}
              />
              <label>
                Owner
                <select name="ownerUserId" defaultValue="">
                  <option value="">Unassigned</option>
                  {loaderData.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                External invoice URL
                <input
                  name="externalInvoiceUrl"
                  type="url"
                  placeholder="https://"
                />
              </label>
              <label>
                External reference
                <input name="externalReference" maxLength={300} />
              </label>
              <label className="checkbox-row">
                <input type="checkbox" name="issueNow" value="1" /> Issue now
              </label>
            </div>
            <label>
              Internal note
              <textarea name="note" maxLength={3000} rows={3} />
            </label>
            <button className="primary-action" disabled={pending}>
              Create invoice
            </button>
          </Form>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Accounts receivable</span>
              <h2>Invoices</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Collected</th>
                  <th>Outstanding</th>
                  <th>Due</th>
                  <th>Context</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber}</strong>
                      <br />
                      <small>{invoice.ownerName}</small>
                    </td>
                    <td>{invoice.customerName}</td>
                    <td>{moneyLabel(invoice.totalCents, invoice.currency)}</td>
                    <td>
                      {moneyLabel(invoice.clearedNetCents, invoice.currency)}
                    </td>
                    <td>
                      {moneyLabel(
                        outstandingInvoiceCents(
                          invoice.totalCents,
                          invoice.clearedNetCents,
                        ),
                        invoice.currency,
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          isOverdue(invoice) ? "status-pill status-overdue" : ""
                        }
                      >
                        {invoice.dueAt ?? "Not set"}
                      </span>
                    </td>
                    <td>
                      {invoice.workspaceName ??
                        invoice.projectTitle ??
                        invoice.campaignTitle ??
                        invoice.agreementTitle ??
                        "General"}
                    </td>
                    <td>
                      <Form method="post" className="inline-form">
                        <input
                          type="hidden"
                          name="intent"
                          value="set-invoice-status"
                        />
                        <input
                          type="hidden"
                          name="invoiceId"
                          value={invoice.id}
                        />
                        <select
                          name="status"
                          defaultValue={
                            ["draft", "issued", "void"].includes(invoice.status)
                              ? invoice.status
                              : "issued"
                          }
                        >
                          <option value="draft">Draft</option>
                          <option value="issued">Issued</option>
                          <option value="void">Void</option>
                        </select>
                        <button disabled={pending}>Save</button>
                      </Form>
                      <small>{invoice.status.replaceAll("_", " ")}</small>
                    </td>
                  </tr>
                ))}
                {loaderData.invoices.length === 0 && (
                  <tr>
                    <td colSpan={8}>No invoices match this view.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Collections</span>
              <h2>Record payment</h2>
            </div>
          </div>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="record-payment" />
            <div className="form-grid two-column-grid">
              <label>
                Invoice
                <select name="invoiceId" required defaultValue="">
                  <option value="" disabled>
                    Select invoice
                  </option>
                  {loaderData.invoices
                    .filter((i) => !["void", "paid"].includes(i.status))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.invoiceNumber} · {i.customerName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Amount
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Status
                <select name="status" defaultValue="cleared">
                  <option value="cleared">Cleared</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </label>
              <label>
                Payment method
                <input name="paymentMethod" maxLength={120} />
              </label>
              <label>
                Paid date
                <input name="paidAt" type="date" />
              </label>
              <label>
                External reference
                <input name="externalReference" maxLength={300} />
              </label>
              <label>
                Evidence URL
                <input name="evidenceUrl" type="url" placeholder="https://" />
              </label>
            </div>
            <button className="primary-action" disabled={pending}>
              Record payment
            </button>
          </Form>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Refunded</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.invoiceNumber}</td>
                    <td>{moneyLabel(p.amountCents, p.currency)}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.externalReference || p.paymentMethod || "Manual"}
                    </td>
                    <td>
                      <Form method="post" className="inline-form">
                        <input
                          type="hidden"
                          name="intent"
                          value="record-refund"
                        />
                        <input type="hidden" name="paymentId" value={p.id} />
                        <input
                          name="refundedAmount"
                          inputMode="decimal"
                          defaultValue={(p.refundedAmountCents / 100).toFixed(
                            2,
                          )}
                          aria-label={`Refund for ${p.invoiceNumber}`}
                        />
                        <button disabled={pending}>Save</button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="status-card">
          <div className="section-heading">
            <div>
              <span className="chapter">Operating costs</span>
              <h2>Record non-creator cost</h2>
            </div>
            <p>
              Creator payouts are not entered here. They are read from Campaign
              Settlement.
            </p>
          </div>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="record-cost" />
            <div className="form-grid two-column-grid">
              <label>
                Description
                <input name="description" maxLength={240} required />
              </label>
              <label>
                Category
                <select name="category" defaultValue="vendor">
                  {commercialCostCategories.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  defaultValue="USD"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue="approved">
                  {commercialCostStatuses.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Incurred date
                <input name="incurredAt" type="date" />
              </label>
              <OptionSelect
                name="workspaceId"
                label="Workspace"
                options={loaderData.workspaces}
              />
              <OptionSelect
                name="projectId"
                label="Project"
                options={loaderData.projects}
              />
              <OptionSelect
                name="campaignId"
                label="Campaign"
                options={loaderData.campaigns}
              />
              <label>
                External reference
                <input name="externalReference" maxLength={300} />
              </label>
              <label>
                Evidence URL
                <input name="evidenceUrl" type="url" placeholder="https://" />
              </label>
            </div>
            <label>
              Internal note
              <textarea name="note" rows={2} maxLength={2000} />
            </label>
            <button className="primary-action" disabled={pending}>
              Record cost
            </button>
          </Form>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cost</th>
                  <th>Amount</th>
                  <th>Context</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.costs.map((cost) => (
                  <tr key={cost.id}>
                    <td>
                      {cost.description}
                      <br />
                      <small>{cost.category}</small>
                    </td>
                    <td>{moneyLabel(cost.amountCents, cost.currency)}</td>
                    <td>
                      {cost.workspaceName ?? cost.projectTitle ?? "General"}
                    </td>
                    <td>
                      <Form method="post" className="inline-form">
                        <input
                          type="hidden"
                          name="intent"
                          value="set-cost-status"
                        />
                        <input type="hidden" name="costId" value={cost.id} />
                        <select name="status" defaultValue={cost.status}>
                          {commercialCostStatuses.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <button disabled={pending}>Save</button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p>
          <Link to="/admin/operating-rhythm">Open Operating Rhythm</Link>
        </p>
      </main>
    </div>
  );
}
