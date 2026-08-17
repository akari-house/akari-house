export const workspaceStatuses = ["trial", "active", "suspended", "closed"] as const;
export type WorkspaceStatus = (typeof workspaceStatuses)[number];

export const workspaceRoles = ["owner", "admin", "finance", "member"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const subscriptionStatuses = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "suspended",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const workspaceModules = [
  "crm",
  "campaigns",
  "fundraising",
  "diligence",
  "relationships",
  "reporting",
  "finance",
] as const;
export type WorkspaceModule = (typeof workspaceModules)[number];

export const workspaceModuleLabels: Record<WorkspaceModule, string> = {
  crm: "CRM",
  campaigns: "Campaigns",
  fundraising: "Fundraising",
  diligence: "Diligence",
  relationships: "Relationships",
  reporting: "Reporting",
  finance: "Finance",
};

export const invoiceStatuses = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const paymentStatuses = ["pending", "cleared", "failed"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const commercialCostStatuses = [
  "planned",
  "approved",
  "paid",
  "cancelled",
] as const;
export type CommercialCostStatus = (typeof commercialCostStatuses)[number];

export const commercialCostCategories = [
  "vendor",
  "software",
  "media",
  "contractor",
  "travel",
  "other",
] as const;
export type CommercialCostCategory = (typeof commercialCostCategories)[number];

export function isWorkspaceStatus(value: string): value is WorkspaceStatus {
  return workspaceStatuses.includes(value as WorkspaceStatus);
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return workspaceRoles.includes(value as WorkspaceRole);
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return subscriptionStatuses.includes(value as SubscriptionStatus);
}

export function isWorkspaceModule(value: string): value is WorkspaceModule {
  return workspaceModules.includes(value as WorkspaceModule);
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return invoiceStatuses.includes(value as InvoiceStatus);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus);
}

export function isCommercialCostStatus(
  value: string,
): value is CommercialCostStatus {
  return commercialCostStatuses.includes(value as CommercialCostStatus);
}

export function isCommercialCostCategory(
  value: string,
): value is CommercialCostCategory {
  return commercialCostCategories.includes(value as CommercialCostCategory);
}

export function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  return /^[A-Z0-9]{3,12}$/.test(currency) ? currency : null;
}

export function normalizeWorkspaceSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length >= 2 ? slug : null;
}

export function workspaceRoleCanManage(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}

export function workspaceRoleCanViewFinance(role: WorkspaceRole) {
  return role === "owner" || role === "admin" || role === "finance";
}

export function parsePlanEntitlements(value: string | null | undefined) {
  const entitlements = Object.fromEntries(
    workspaceModules.map((module) => [module, false]),
  ) as Record<WorkspaceModule, boolean>;
  if (!value) return entitlements;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const module of workspaceModules)
      entitlements[module] = parsed[module] === true;
  } catch {
    return entitlements;
  }
  return entitlements;
}

export function effectiveWorkspaceEntitlements(
  planJson: string | null | undefined,
  overrides: Array<{ moduleKey: string; enabled: number | boolean }>,
) {
  const effective = parsePlanEntitlements(planJson);
  for (const override of overrides) {
    if (!isWorkspaceModule(override.moduleKey)) continue;
    effective[override.moduleKey] = Boolean(override.enabled);
  }
  return effective;
}

export function invoiceCollectionState(
  status: InvoiceStatus,
  totalCents: number,
  clearedNetCents: number,
): InvoiceStatus {
  if (status === "void" || status === "draft") return status;
  if (clearedNetCents >= totalCents && totalCents > 0) return "paid";
  if (clearedNetCents > 0) return "partially_paid";
  return "issued";
}

export function outstandingInvoiceCents(totalCents: number, clearedNetCents: number) {
  return Math.max(0, totalCents - Math.max(0, clearedNetCents));
}

export function isInvoiceOverdue(
  status: InvoiceStatus,
  dueAt: string | null,
  now = new Date(),
) {
  if (!dueAt || ["draft", "paid", "void"].includes(status)) return false;
  const due = new Date(dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < now.getTime();
}

export type CurrencyAmount = { currency: string; amountCents: number };

export function sumByCurrency(items: CurrencyAmount[]) {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const currency = normalizeCurrency(item.currency);
    if (!currency || !Number.isFinite(item.amountCents)) continue;
    totals[currency] = (totals[currency] ?? 0) + Math.trunc(item.amountCents);
  }
  return totals;
}

export function moneyLabel(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`;
  }
}
