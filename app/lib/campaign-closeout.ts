export const campaignCloseoutStatuses = [
  "active",
  "delivery_complete",
  "awaiting_approvals",
  "awaiting_settlement",
  "settled",
  "reporting",
  "client_delivered",
  "closed",
] as const;

export type CampaignCloseoutStatus = (typeof campaignCloseoutStatuses)[number];

export type SettlementRollupItem = {
  applicationId: string;
  baseFinalCents: number;
  bonusCents: number;
  settlementFinalCents: number | null;
  paymentStatus: string | null;
};

export type CampaignReconciliation = {
  creatorCount: number;
  approvedCompensationCents: number;
  recordedSettlementCents: number;
  paidCents: number;
  outstandingCents: number;
  paidCreatorCount: number;
  unresolvedCreatorCount: number;
  allPaid: boolean;
};

export function creatorApprovedCompensationCents(
  baseFinalCents: number,
  bonusCents: number,
) {
  return Math.max(0, baseFinalCents) + Math.max(0, bonusCents);
}

export function campaignReconciliation(
  items: SettlementRollupItem[],
): CampaignReconciliation {
  let approvedCompensationCents = 0;
  let recordedSettlementCents = 0;
  let paidCents = 0;
  let paidCreatorCount = 0;

  for (const item of items) {
    const approved = creatorApprovedCompensationCents(
      item.baseFinalCents,
      item.bonusCents,
    );
    const recorded = item.settlementFinalCents ?? approved;
    approvedCompensationCents += approved;
    recordedSettlementCents += Math.max(0, recorded);
    if (item.paymentStatus === "paid") {
      paidCreatorCount += 1;
      paidCents += Math.max(0, recorded);
    }
  }

  const outstandingCents = Math.max(0, recordedSettlementCents - paidCents);
  const creatorCount = items.length;
  return {
    creatorCount,
    approvedCompensationCents,
    recordedSettlementCents,
    paidCents,
    outstandingCents,
    paidCreatorCount,
    unresolvedCreatorCount: Math.max(0, creatorCount - paidCreatorCount),
    allPaid: creatorCount === 0 || paidCreatorCount === creatorCount,
  };
}

export type CloseoutStateInput = {
  campaignEnded: boolean;
  unresolvedApprovalCount: number;
  missingFinalMetricCount: number;
  openDisputeCount: number;
  allPaid: boolean;
  reportFinal: boolean;
  reportDelivered: boolean;
  closed: boolean;
};

export function deriveCampaignCloseoutStatus(
  input: CloseoutStateInput,
): CampaignCloseoutStatus {
  if (input.closed) return "closed";
  if (input.reportDelivered) return "client_delivered";
  if (input.reportFinal) return "reporting";

  const deliveryReady =
    input.campaignEnded &&
    input.unresolvedApprovalCount === 0 &&
    input.missingFinalMetricCount === 0 &&
    input.openDisputeCount === 0;

  if (deliveryReady && input.allPaid) return "settled";
  if (deliveryReady) return "awaiting_settlement";
  if (input.campaignEnded && input.unresolvedApprovalCount > 0)
    return "awaiting_approvals";
  if (input.campaignEnded) return "delivery_complete";
  return "active";
}

export function safeExternalUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
