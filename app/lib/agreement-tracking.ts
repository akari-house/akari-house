export const agreementTypes = [
  "service",
  "campaign",
  "nda",
  "advisory",
  "fundraising",
  "partnership",
  "other",
] as const;

export const agreementStatuses = [
  "required",
  "with_lawyer",
  "ready_to_send",
  "sent",
  "negotiation",
  "signed",
  "expired",
  "terminated",
  "not_required",
] as const;

export type AgreementType = (typeof agreementTypes)[number];
export type AgreementStatus = (typeof agreementStatuses)[number];

export const agreementTypeLabels: Record<AgreementType, string> = {
  service: "Service agreement",
  campaign: "Campaign agreement",
  nda: "NDA",
  advisory: "Advisory agreement",
  fundraising: "Fundraising mandate/reference",
  partnership: "Partnership agreement",
  other: "Other",
};

export const agreementStatusLabels: Record<AgreementStatus, string> = {
  required: "Agreement required",
  with_lawyer: "With lawyer",
  ready_to_send: "Ready to send",
  sent: "Sent",
  negotiation: "External negotiation",
  signed: "Signed externally",
  expired: "Expired",
  terminated: "Terminated",
  not_required: "Not required",
};

export function isAgreementType(value: string): value is AgreementType {
  return agreementTypes.includes(value as AgreementType);
}

export function isAgreementStatus(value: string): value is AgreementStatus {
  return agreementStatuses.includes(value as AgreementStatus);
}

export function normalizeExternalAgreementUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function agreementNeedsFollowUp(
  status: AgreementStatus,
  nextFollowUpAt: string | null,
  now = new Date(),
) {
  if (!nextFollowUpAt || ["terminated", "not_required"].includes(status))
    return false;
  const due = nextFollowUpAt.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(due) && due <= today;
}

export function agreementExpiryState(
  status: AgreementStatus,
  expiresAt: string | null,
  now = new Date(),
) {
  if (!expiresAt || ["terminated", "not_required"].includes(status))
    return "none" as const;
  const expiry = new Date(`${expiresAt}T23:59:59.999Z`);
  if (!Number.isFinite(expiry.getTime())) return "none" as const;
  if (expiry.getTime() < now.getTime()) return "expired" as const;
  const days = (expiry.getTime() - now.getTime()) / 86_400_000;
  return days <= 30 ? ("expiring" as const) : ("current" as const);
}

export function agreementAttentionRank(input: {
  status: AgreementStatus;
  nextFollowUpAt: string | null;
  expiresAt: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (agreementNeedsFollowUp(input.status, input.nextFollowUpAt, now)) return 0;
  const expiry = agreementExpiryState(input.status, input.expiresAt, now);
  if (expiry === "expired") return 1;
  if (expiry === "expiring") return 2;
  if (
    [
      "required",
      "with_lawyer",
      "ready_to_send",
      "sent",
      "negotiation",
    ].includes(input.status)
  )
    return 3;
  return 4;
}
