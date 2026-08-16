import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/campaign-closeout";
import { SiteHeader } from "~/components/SiteHeader";
import {
  campaignReconciliation,
  campaignRenewalStages,
  campaignRenewalTypes,
  creatorApprovedCompensationCents,
  deriveCampaignCloseoutStatus,
  safeExternalUrl,
} from "~/lib/campaign-closeout";
import { requireCampaignOperator } from "~/lib/campaign-operations.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  campaignKind: string;
  currency: string;
  budgetCents: number;
  startsAt: string | null;
  endsAt: string | null;
  projectId: string;
  projectTitle: string;
};

type ParticipantRow = {
  applicationId: string;
  creatorUserId: string;
  creatorName: string;
  username: string;
  originalAllocationCents: number;
  baseFinalCents: number;
  bonusCents: number;
  settlementId: string | null;
  settlementFinalCents: number | null;
  settlementType: string | null;
  tokenSymbol: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  evidenceReference: string | null;
  transactionReference: string | null;
  internalNote: string | null;
  paidAt: string | null;
};

type OperationalSummary = {
  acceptedCreators: number;
  submittedContent: number;
  approvedContent: number;
  pendingContentReviews: number;
  pendingWorkReviews: number;
  missingFinalMetrics: number;
  openDisputes: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
  totalBookmarks: number;
  totalClicks: number;
};

type CloseoutRow = {
  status: string;
  reportReferenceUrl: string | null;
  reportSentTo: string | null;
  reportSentAt: string | null;
  clientAcknowledgementStatus: string;
  clientAcknowledgementNote: string | null;
  clientAcknowledgedAt: string | null;
  closeoutNote: string | null;
  closedAt: string | null;
  renewalType: string;
  renewalStage: string;
  renewalFollowUpAt: string | null;
  renewalReferenceUrl: string | null;
  renewalNote: string | null;
  renewedAt: string | null;
};

async function getCampaign(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.status,
              c.campaign_kind AS campaignKind, c.currency,
              c.budget_cents AS budgetCents,
              c.starts_at AS startsAt, c.ends_at AS endsAt,
              p.id AS projectId, p.title AS projectTitle
       FROM ambassador_campaigns c
       JOIN projects p ON p.id = c.project_id
       WHERE c.slug = ?`,
    )
    .bind(slug)
    .first<CampaignRow>();
}

async function getParticipants(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT ca.id AS applicationId,
                ca.creator_user_id AS creatorUserId,
                p.display_name AS creatorName, u.username,
                ca.payout_cents AS originalAllocationCents,
                COALESCE(ca.final_payout_cents, ca.payout_cents) AS baseFinalCents,
                COALESCE((
                  SELECT SUM(cb.amount_cents)
                  FROM campaign_creator_bonuses cb
                  WHERE cb.application_id = ca.id
                    AND cb.status IN ('approved', 'paid')
                ), 0) AS bonusCents,
                cs.id AS settlementId,
                cs.final_amount_cents AS settlementFinalCents,
                cs.settlement_type AS settlementType,
                cs.token_symbol AS tokenSymbol,
                cs.payment_status AS paymentStatus,
                cs.payment_method AS paymentMethod,
                cs.evidence_reference AS evidenceReference,
                cs.transaction_reference AS transactionReference,
                cs.internal_note AS internalNote,
                cs.paid_at AS paidAt
         FROM campaign_applications ca
         JOIN users u ON u.id = ca.creator_user_id
         JOIN profiles p ON p.user_id = ca.creator_user_id
         LEFT JOIN campaign_settlements cs ON cs.application_id = ca.id
         WHERE ca.campaign_id = ? AND ca.status = 'accepted'
         ORDER BY p.display_name`,
      )
      .bind(campaignId)
      .all<ParticipantRow>()
  ).results;
}

async function getOperationalSummary(
  db: D1Database,
  campaignId: string,
): Promise<OperationalSummary> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM campaign_applications ca
          WHERE ca.campaign_id = ? AND ca.status = 'accepted') AS acceptedCreators,
         (SELECT COUNT(*) FROM campaign_content_items ci
          WHERE ci.campaign_id = ?) AS submittedContent,
         (SELECT COUNT(*) FROM campaign_content_items ci
          WHERE ci.campaign_id = ? AND ci.status = 'approved') AS approvedContent,
         (SELECT COUNT(*) FROM campaign_content_items ci
          WHERE ci.campaign_id = ? AND ci.status = 'submitted') AS pendingContentReviews,
         (SELECT COUNT(*) FROM campaign_work_submissions ws
          WHERE ws.campaign_id = ? AND ws.status = 'submitted') AS pendingWorkReviews,
         (SELECT COUNT(*) FROM campaign_content_items ci
          WHERE ci.campaign_id = ? AND ci.status = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM campaign_content_metric_snapshots ms
              WHERE ms.content_item_id = ci.id AND ms.is_final = 1
            )) AS missingFinalMetrics,
         (SELECT COUNT(*) FROM campaign_disputes cd
          WHERE cd.campaign_id = ? AND cd.status IN ('open', 'reviewing')) AS openDisputes,
         COALESCE((SELECT SUM(ms.views)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalViews,
         COALESCE((SELECT SUM(ms.likes)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalLikes,
         COALESCE((SELECT SUM(ms.comments)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalComments,
         COALESCE((SELECT SUM(ms.reposts)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalReposts,
         COALESCE((SELECT SUM(ms.bookmarks)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalBookmarks,
         COALESCE((SELECT SUM(ms.clicks)
          FROM campaign_content_metric_snapshots ms
          WHERE ms.campaign_id = ? AND ms.is_final = 1), 0) AS totalClicks`,
    )
    .bind(
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
      campaignId,
    )
    .first<OperationalSummary>();
  return (
    row ?? {
      acceptedCreators: 0,
      submittedContent: 0,
      approvedContent: 0,
      pendingContentReviews: 0,
      pendingWorkReviews: 0,
      missingFinalMetrics: 0,
      openDisputes: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalReposts: 0,
      totalBookmarks: 0,
      totalClicks: 0,
    }
  );
}

async function getCloseout(db: D1Database, campaignId: string) {
  return db
    .prepare(
      `SELECT status,
              report_reference_url AS reportReferenceUrl,
              report_sent_to AS reportSentTo,
              report_sent_at AS reportSentAt,
              client_acknowledgement_status AS clientAcknowledgementStatus,
              client_acknowledgement_note AS clientAcknowledgementNote,
              client_acknowledged_at AS clientAcknowledgedAt,
              closeout_note AS closeoutNote, closed_at AS closedAt,
              renewal_type AS renewalType, renewal_stage AS renewalStage,
              renewal_follow_up_at AS renewalFollowUpAt,
              renewal_reference_url AS renewalReferenceUrl,
              renewal_note AS renewalNote, renewed_at AS renewedAt
       FROM campaign_closeouts WHERE campaign_id = ?`,
    )
    .bind(campaignId)
    .first<CloseoutRow>();
}

async function getFinalReport(db: D1Database, campaignId: string) {
  return db
    .prepare(
      `SELECT status, generated_at AS generatedAt,
              finalized_at AS finalizedAt, summary_json AS summaryJson
       FROM campaign_final_reports WHERE campaign_id = ?`,
    )
    .bind(campaignId)
    .first<{
      status: string;
      generatedAt: string;
      finalizedAt: string | null;
      summaryJson: string;
    }>();
}

function campaignHasEnded(campaign: CampaignRow) {
  if (!campaign.endsAt) return false;
  return new Date().toISOString().slice(0, 10) >= campaign.endsAt.slice(0, 10);
}

function rollupParticipants(participants: ParticipantRow[]) {
  return campaignReconciliation(
    participants.map((participant) => ({
      applicationId: participant.applicationId,
      baseFinalCents: participant.baseFinalCents,
      bonusCents: participant.bonusCents,
      settlementFinalCents: participant.settlementFinalCents,
      paymentStatus: participant.paymentStatus,
    })),
  );
}

function closeoutStatus(
  campaign: CampaignRow,
  operational: OperationalSummary,
  reconciliation: ReturnType<typeof rollupParticipants>,
  report: Awaited<ReturnType<typeof getFinalReport>>,
  closeout: CloseoutRow | null,
) {
  return deriveCampaignCloseoutStatus({
    campaignEnded: campaignHasEnded(campaign),
    unresolvedApprovalCount:
      operational.pendingContentReviews + operational.pendingWorkReviews,
    missingFinalMetricCount: operational.missingFinalMetrics,
    openDisputeCount: operational.openDisputes,
    allPaid: reconciliation.allPaid,
    reportFinal: report?.status === "final",
    reportDelivered: Boolean(closeout?.reportSentAt),
    closed: Boolean(closeout?.closedAt),
    renewalConverted: closeout?.renewalStage === "converted",
  });
}

async function syncCloseoutStatus(db: D1Database, campaign: CampaignRow) {
  const [participants, operational, report, closeout] = await Promise.all([
    getParticipants(db, campaign.id),
    getOperationalSummary(db, campaign.id),
    getFinalReport(db, campaign.id),
    getCloseout(db, campaign.id),
  ]);
  const status = closeoutStatus(
    campaign,
    operational,
    rollupParticipants(participants),
    report,
    closeout,
  );
  await db
    .prepare(
      `INSERT INTO campaign_closeouts (campaign_id, status)
       VALUES (?, ?)
       ON CONFLICT(campaign_id) DO UPDATE SET
         status = excluded.status, updated_at = datetime('now')`,
    )
    .bind(campaign.id, status)
    .run();
  return status;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const campaign = await getCampaign(db, params.slug);
  if (!campaign || campaign.campaignKind === "iio")
    throw new Response("Campaign closeout not found.", { status: 404 });
  const user = await requireCampaignOperator(request, db, campaign.id);
  const [participants, operational, report, closeout] = await Promise.all([
    getParticipants(db, campaign.id),
    getOperationalSummary(db, campaign.id),
    getFinalReport(db, campaign.id),
    getCloseout(db, campaign.id),
  ]);
  const reconciliation = rollupParticipants(participants);
  const status = closeoutStatus(
    campaign,
    operational,
    reconciliation,
    report,
    closeout,
  );
  return {
    user,
    campaign,
    participants,
    operational,
    reconciliation,
    report,
    closeout,
    status,
    campaignEnded: campaignHasEnded(campaign),
    saved: new URL(request.url).searchParams.get("saved") ?? "",
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const campaign = await getCampaign(db, params.slug);
  if (!campaign || campaign.campaignKind === "iio")
    throw new Response("Campaign closeout not found.", { status: 404 });
  const operator = await requireCampaignOperator(request, db, campaign.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "save-settlement") {
    const applicationId = formText(form.get("applicationId"));
    const participant = (await getParticipants(db, campaign.id)).find(
      (item) => item.applicationId === applicationId,
    );
    if (!participant) throw new Response("Creator not found.", { status: 404 });
    const amount = Number(formText(form.get("amount")));
    const finalAmountCents = Math.round(amount * 100);
    const approvedCompensationCents = creatorApprovedCompensationCents(
      participant.baseFinalCents,
      participant.bonusCents,
    );
    const settlementType = formText(form.get("settlementType"));
    const paymentStatus = formText(form.get("paymentStatus"));
    const tokenSymbol = formText(form.get("tokenSymbol")).trim().toUpperCase();
    const paymentMethod = formText(form.get("paymentMethod")).trim();
    const evidenceReference = formText(form.get("evidenceReference")).trim();
    const transactionReference = formText(
      form.get("transactionReference"),
    ).trim();
    const internalNote = formText(form.get("internalNote")).trim();
    const adjustmentReason = formText(form.get("adjustmentReason")).trim();
    const changedAmount =
      finalAmountCents !==
      (participant.settlementFinalCents ?? approvedCompensationCents);
    const deviatesFromApproved = finalAmountCents !== approvedCompensationCents;
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !["cash", "token", "mixed", "other"].includes(settlementType) ||
      ![
        "pending",
        "approved",
        "processing",
        "paid",
        "failed",
        "cancelled",
      ].includes(paymentStatus) ||
      tokenSymbol.length > 20 ||
      paymentMethod.length > 200 ||
      evidenceReference.length > 500 ||
      transactionReference.length > 200 ||
      internalNote.length > 1000 ||
      ((changedAmount || deviatesFromApproved) && adjustmentReason.length < 10)
    )
      return {
        error:
          "Check the settlement amount, status and references. Explain any amount that differs from approved compensation.",
      };
    if (
      paymentStatus === "paid" &&
      (!paymentMethod || (!evidenceReference && !transactionReference))
    )
      return {
        error:
          "A paid settlement requires a payment method and transaction or evidence reference.",
      };

    const settlementId = participant.settlementId ?? crypto.randomUUID();
    const previousStatus = participant.paymentStatus;
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO campaign_settlements
           (id, campaign_id, application_id, creator_user_id,
            original_allocation_cents, final_amount_cents, settlement_type,
            currency, token_symbol, payment_status, payment_method,
            evidence_reference, transaction_reference, internal_note,
            approved_by, approved_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
             CASE WHEN ? = 'paid' THEN datetime('now') ELSE NULL END)
           ON CONFLICT(application_id) DO UPDATE SET
             final_amount_cents = excluded.final_amount_cents,
             settlement_type = excluded.settlement_type,
             token_symbol = excluded.token_symbol,
             payment_status = excluded.payment_status,
             payment_method = excluded.payment_method,
             evidence_reference = excluded.evidence_reference,
             transaction_reference = excluded.transaction_reference,
             internal_note = excluded.internal_note,
             approved_by = excluded.approved_by,
             approved_at = datetime('now'),
             paid_at = CASE WHEN excluded.payment_status = 'paid'
               THEN COALESCE(campaign_settlements.paid_at, datetime('now'))
               ELSE NULL END,
             updated_at = datetime('now')`,
        )
        .bind(
          settlementId,
          campaign.id,
          participant.applicationId,
          participant.creatorUserId,
          participant.originalAllocationCents,
          finalAmountCents,
          settlementType,
          campaign.currency,
          tokenSymbol || null,
          paymentStatus,
          paymentMethod || null,
          evidenceReference || null,
          transactionReference || null,
          internalNote || null,
          operator.id,
          paymentStatus,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.settlement_saved', 'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          participant.applicationId,
          JSON.stringify({
            approvedCompensationCents,
            finalAmountCents,
            settlementType,
            paymentStatus,
            previousStatus,
          }),
        ),
    ];
    if (changedAmount || (!participant.settlementId && deviatesFromApproved))
      statements.push(
        db
          .prepare(
            `INSERT INTO campaign_settlement_adjustments
             (id, settlement_id, previous_amount_cents, new_amount_cents,
              reason, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            settlementId,
            participant.settlementFinalCents ?? approvedCompensationCents,
            finalAmountCents,
            adjustmentReason,
            operator.id,
          ),
      );
    if (paymentStatus === "paid" && previousStatus !== "paid")
      statements.push(
        db
          .prepare(
            `INSERT INTO notifications
             (id, user_id, kind, title, body, action_url)
             VALUES (?, ?, 'campaign.payment_confirmed',
                     'Campaign payment confirmed', ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            participant.creatorUserId,
            `${campaign.title}: ${campaign.currency} ${(finalAmountCents / 100).toFixed(2)} has been recorded as paid.`,
            `/campaigns/${campaign.slug}/performance`,
          ),
      );
    await db.batch(statements);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=settlement`);
  }

  if (intent === "finalize-report") {
    const [participants, operational] = await Promise.all([
      getParticipants(db, campaign.id),
      getOperationalSummary(db, campaign.id),
    ]);
    const reconciliation = rollupParticipants(participants);
    const unresolvedApprovalCount =
      operational.pendingContentReviews + operational.pendingWorkReviews;
    if (!campaignHasEnded(campaign))
      return { error: "The final report unlocks when the campaign ends." };
    if (
      unresolvedApprovalCount > 0 ||
      operational.missingFinalMetrics > 0 ||
      operational.openDisputes > 0
    )
      return {
        error:
          "Resolve pending approvals, final metric gaps and open disputes before finalizing the report.",
      };
    if (!reconciliation.allPaid)
      return {
        error:
          "Complete every Creator settlement before finalizing the client report.",
      };
    const totalEngagements =
      operational.totalLikes +
      operational.totalComments +
      operational.totalReposts +
      operational.totalBookmarks;
    const summary = {
      campaignId: campaign.id,
      projectId: campaign.projectId,
      generatedAt: new Date().toISOString(),
      acceptedCreators: operational.acceptedCreators,
      submittedContent: operational.submittedContent,
      approvedContent: operational.approvedContent,
      totalViews: operational.totalViews,
      totalLikes: operational.totalLikes,
      totalComments: operational.totalComments,
      totalReposts: operational.totalReposts,
      totalBookmarks: operational.totalBookmarks,
      totalClicks: operational.totalClicks,
      totalEngagements,
      engagementRate:
        operational.totalViews > 0
          ? totalEngagements / operational.totalViews
          : 0,
      approvedCompensationCents: reconciliation.approvedCompensationCents,
      finalSettlementCents: reconciliation.recordedSettlementCents,
      paidCents: reconciliation.paidCents,
    };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_final_reports
           (id, campaign_id, status, generated_by, finalized_at, summary_json)
           VALUES (?, ?, 'final', ?, datetime('now'), ?)
           ON CONFLICT(campaign_id) DO UPDATE SET
             status = 'final', generated_by = excluded.generated_by,
             generated_at = datetime('now'), finalized_at = datetime('now'),
             summary_json = excluded.summary_json`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          operator.id,
          JSON.stringify(summary),
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.final_report_generated', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify(summary),
        ),
    ]);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=report`);
  }

  if (intent === "mark-report-delivered") {
    const report = await getFinalReport(db, campaign.id);
    if (report?.status !== "final")
      return { error: "Finalize the campaign report before client delivery." };
    const reportSentTo = formText(form.get("reportSentTo")).trim();
    const reportReferenceValue = formText(
      form.get("reportReferenceUrl"),
    ).trim();
    const reportReferenceUrl = safeExternalUrl(reportReferenceValue);
    if (
      reportSentTo.length < 3 ||
      reportSentTo.length > 200 ||
      (reportReferenceValue && !reportReferenceUrl)
    )
      return {
        error: "Add the recipient and an optional valid external report URL.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_closeouts
           (campaign_id, report_reference_url, report_sent_to,
            report_sent_by, report_sent_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(campaign_id) DO UPDATE SET
             report_reference_url = excluded.report_reference_url,
             report_sent_to = excluded.report_sent_to,
             report_sent_by = excluded.report_sent_by,
             report_sent_at = datetime('now'), updated_at = datetime('now')`,
        )
        .bind(
          campaign.id,
          reportReferenceUrl || null,
          reportSentTo,
          operator.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.report_delivered', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({ reportSentTo, reportReferenceUrl }),
        ),
    ]);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=delivered`);
  }

  if (intent === "record-client-acknowledgement") {
    const closeout = await getCloseout(db, campaign.id);
    if (!closeout?.reportSentAt)
      return { error: "Record client report delivery first." };
    const acknowledgementStatus = formText(
      form.get("clientAcknowledgementStatus"),
    );
    const note = formText(form.get("clientAcknowledgementNote")).trim();
    if (
      !["acknowledged", "not_required"].includes(acknowledgementStatus) ||
      note.length > 1000 ||
      (acknowledgementStatus === "not_required" && note.length < 5)
    )
      return {
        error:
          "Record acknowledgement, or explain why explicit acknowledgement is not required.",
      };
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_closeouts
           SET client_acknowledgement_status = ?,
               client_acknowledgement_note = ?, client_acknowledged_by = ?,
               client_acknowledged_at = datetime('now'),
               updated_at = datetime('now')
           WHERE campaign_id = ?`,
        )
        .bind(
          acknowledgementStatus,
          note || null,
          operator.id,
          campaign.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.client_acknowledgement_recorded',
                   'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({ acknowledgementStatus, note }),
        ),
    ]);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=acknowledged`);
  }

  if (intent === "close-campaign") {
    const [participants, operational, report, closeout] = await Promise.all([
      getParticipants(db, campaign.id),
      getOperationalSummary(db, campaign.id),
      getFinalReport(db, campaign.id),
      getCloseout(db, campaign.id),
    ]);
    const reconciliation = rollupParticipants(participants);
    const closeoutNote = formText(form.get("closeoutNote")).trim();
    const blockers =
      operational.pendingContentReviews +
      operational.pendingWorkReviews +
      operational.missingFinalMetrics +
      operational.openDisputes;
    if (
      !campaignHasEnded(campaign) ||
      blockers > 0 ||
      !reconciliation.allPaid ||
      report?.status !== "final" ||
      !closeout?.reportSentAt ||
      closeout.clientAcknowledgementStatus === "pending"
    )
      return {
        error:
          "Closeout requires completed reviews and metrics, paid Creator settlements, a final delivered report and a client acknowledgement decision.",
      };
    if (closeoutNote.length < 10 || closeoutNote.length > 1000)
      return { error: "Add a closeout note between 10 and 1,000 characters." };
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_closeouts
           SET closeout_note = ?, closed_by = ?, closed_at = datetime('now'),
               status = 'closed', updated_at = datetime('now')
           WHERE campaign_id = ?`,
        )
        .bind(closeoutNote, operator.id, campaign.id),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.closed', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({ closeoutNote }),
        ),
    ]);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=closed`);
  }

  if (intent === "save-renewal") {
    const closeout = await getCloseout(db, campaign.id);
    if (!closeout?.closedAt)
      return { error: "Close the completed campaign before recording renewal." };
    const renewalType = formText(form.get("renewalType"));
    const renewalStage = formText(form.get("renewalStage"));
    const followUpAt = formText(form.get("renewalFollowUpAt")).trim();
    const referenceValue = formText(form.get("renewalReferenceUrl")).trim();
    const referenceUrl = safeExternalUrl(referenceValue);
    const note = formText(form.get("renewalNote")).trim();
    if (
      !campaignRenewalTypes.includes(
        renewalType as (typeof campaignRenewalTypes)[number],
      ) ||
      !campaignRenewalStages.includes(
        renewalStage as (typeof campaignRenewalStages)[number],
      ) ||
      (referenceValue && !referenceUrl) ||
      note.length > 1000 ||
      (renewalType === "none" && !["none", "declined"].includes(renewalStage)) ||
      (renewalType !== "none" && renewalStage === "none") ||
      (renewalType === "follow_up" && renewalStage === "planned" && !followUpAt) ||
      (renewalStage === "converted" && note.length < 5)
    )
      return {
        error:
          "Check the renewal type, stage, follow-up date, optional reference and note.",
      };
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_closeouts
           SET renewal_type = ?, renewal_stage = ?, renewal_follow_up_at = ?,
               renewal_reference_url = ?, renewal_note = ?,
               renewal_recorded_by = ?, renewal_recorded_at = datetime('now'),
               renewed_at = CASE WHEN ? = 'converted' THEN datetime('now') ELSE NULL END,
               updated_at = datetime('now')
           WHERE campaign_id = ?`,
        )
        .bind(
          renewalType,
          renewalStage,
          followUpAt || null,
          referenceUrl || null,
          note || null,
          operator.id,
          renewalStage,
          campaign.id,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.renewal_recorded', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          operator.id,
          campaign.id,
          JSON.stringify({
            renewalType,
            renewalStage,
            followUpAt,
            referenceUrl,
          }),
        ),
    ]);
    await syncCloseoutStatus(db, campaign);
    throw redirect(`/campaigns/${campaign.slug}/closeout?saved=renewal`);
  }

  throw new Response("Unsupported campaign closeout action.", { status: 400 });
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function CampaignCloseout({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const {
    campaign,
    operational,
    reconciliation,
    participants,
    report,
    closeout,
  } = loaderData;
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: campaign.currency,
  });
  const unresolvedApprovals =
    operational.pendingContentReviews + operational.pendingWorkReviews;
  const blockers =
    unresolvedApprovals +
    operational.missingFinalMetrics +
    operational.openDisputes;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to={`/campaigns/${campaign.slug}/performance`}>
          Back to campaign performance
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Campaign closeout</span>
            <h1>{campaign.title}</h1>
            <p>
              Reconcile Creator compensation, confirm external payments, deliver
              the final client report and record the commercial follow-up.
            </p>
          </div>
          <div className="button-row">
            <Link
              className="button button-quiet"
              to={`/admin/campaign-compensation/${campaign.slug}/report.xls`}
            >
              Internal report
            </Link>
            <Link
              className="button button-primary"
              to={`/admin/campaign-compensation/${campaign.slug}/report.xls?view=project`}
            >
              Client-safe report
            </Link>
          </div>
        </header>
        {loaderData.saved && (
          <p className="notice success">Campaign closeout updated.</p>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <section className="iio-command-bar">
          <div>
            <strong>{statusLabel(loaderData.status)}</strong>
            <span>closeout status</span>
          </div>
          <div>
            <strong>{reconciliation.paidCreatorCount}/{reconciliation.creatorCount}</strong>
            <span>Creators paid</span>
          </div>
          <div>
            <strong>{money.format(reconciliation.outstandingCents / 100)}</strong>
            <span>outstanding</span>
          </div>
          <div>
            <strong>{blockers}</strong>
            <span>delivery blockers</span>
          </div>
        </section>

        <section className="admin-panel">
          <span className="chapter">Closeout readiness</span>
          <h2>Finish the operating loop in order.</h2>
          <div className="member-home-stats">
            <article>
              <strong>{loaderData.campaignEnded ? "Ready" : "Active"}</strong>
              <span>Campaign ended</span>
            </article>
            <article>
              <strong>{unresolvedApprovals}</strong>
              <span>Pending content/work reviews</span>
            </article>
            <article>
              <strong>{operational.missingFinalMetrics}</strong>
              <span>Approved posts missing final metrics</span>
            </article>
            <article>
              <strong>{operational.openDisputes}</strong>
              <span>Open disputes</span>
            </article>
          </div>
          <p>
            Accepted Creators: {operational.acceptedCreators} · approved content:{" "}
            {operational.approvedContent}/{operational.submittedContent} · final views:{" "}
            {operational.totalViews.toLocaleString()}.
          </p>
        </section>

        <section className="admin-panel">
          <span className="chapter">Financial reconciliation</span>
          <h2>Approved compensation vs recorded settlement.</h2>
          <div className="member-home-stats">
            <article>
              <strong>{money.format(reconciliation.approvedCompensationCents / 100)}</strong>
              <span>Approved compensation</span>
            </article>
            <article>
              <strong>{money.format(reconciliation.recordedSettlementCents / 100)}</strong>
              <span>Recorded settlement</span>
            </article>
            <article>
              <strong>{money.format(reconciliation.paidCents / 100)}</strong>
              <span>Paid</span>
            </article>
            <article>
              <strong>{money.format(reconciliation.outstandingCents / 100)}</strong>
              <span>Outstanding</span>
            </article>
          </div>
          {campaign.budgetCents > 0 &&
            reconciliation.recordedSettlementCents > campaign.budgetCents && (
              <p className="form-error" role="alert">
                Recorded settlement exceeds the configured campaign budget by{" "}
                {money.format(
                  (reconciliation.recordedSettlementCents - campaign.budgetCents) /
                    100,
                )}.
              </p>
            )}
        </section>

        <section className="application-list">
          <header>
            <span className="eyebrow">Creator settlement</span>
            <h2>Canonical payment status and evidence.</h2>
            <p>
              Approved compensation combines the final base payout with approved
              bonuses. Any settlement adjustment requires a reason and is kept in
              history.
            </p>
          </header>
          {participants.map((participant) => {
            const approved = creatorApprovedCompensationCents(
              participant.baseFinalCents,
              participant.bonusCents,
            );
            const current = participant.settlementFinalCents ?? approved;
            return (
              <article className="application-card" key={participant.applicationId}>
                <div>
                  <span className="chapter">
                    {participant.paymentStatus ?? "pending"}
                  </span>
                  <h3>{participant.creatorName}</h3>
                  <p>
                    Final base: {money.format(participant.baseFinalCents / 100)} ·
                    approved bonus: {money.format(participant.bonusCents / 100)}
                  </p>
                  <p>
                    Approved compensation: {money.format(approved / 100)} · recorded:{" "}
                    {money.format(current / 100)}
                  </p>
                  {participant.paidAt && (
                    <small>Paid {new Date(participant.paidAt).toLocaleString()}</small>
                  )}
                </div>
                <Form method="post" className="profile-form">
                  <input type="hidden" name="intent" value="save-settlement" />
                  <input type="hidden" name="applicationId" value={participant.applicationId} />
                  <div className="form-row form-row-three">
                    <label>
                      Final settlement ({campaign.currency})
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={current / 100}
                        required
                      />
                    </label>
                    <label>
                      Settlement type
                      <select name="settlementType" defaultValue={participant.settlementType ?? "cash"}>
                        <option value="cash">Cash</option>
                        <option value="token">Token</option>
                        <option value="mixed">Mixed</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Payment status
                      <select name="paymentStatus" defaultValue={participant.paymentStatus ?? "pending"}>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="processing">Processing</option>
                        <option value="paid">Paid</option>
                        <option value="failed">Failed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row form-row-three">
                    <label>
                      Payment method
                      <input name="paymentMethod" maxLength={200} defaultValue={participant.paymentMethod ?? ""} />
                    </label>
                    <label>
                      Token symbol
                      <input name="tokenSymbol" maxLength={20} defaultValue={participant.tokenSymbol ?? ""} />
                    </label>
                    <label>
                      Transaction reference
                      <input name="transactionReference" maxLength={200} defaultValue={participant.transactionReference ?? ""} />
                    </label>
                  </div>
                  <label>
                    Payment evidence link or invoice reference
                    <input name="evidenceReference" maxLength={500} defaultValue={participant.evidenceReference ?? ""} />
                  </label>
                  <label>
                    Adjustment reason
                    <input name="adjustmentReason" maxLength={500} placeholder="Required if the total differs from approved compensation." />
                  </label>
                  <label>
                    Internal settlement note
                    <textarea name="internalNote" maxLength={1000} defaultValue={participant.internalNote ?? ""} />
                  </label>
                  <button className="button button-primary" disabled={navigation.state !== "idle"}>
                    Save settlement
                  </button>
                </Form>
              </article>
            );
          })}
        </section>

        <section className="admin-panel">
          <span className="chapter">Final client report</span>
          <h2>{report?.status === "final" ? "Final report is locked to closeout evidence." : "Generate the final campaign snapshot."}</h2>
          <p>
            The client-safe export uses the existing campaign performance data and
            excludes private Creator compensation. Internal settlement stays in the
            internal report.
          </p>
          {report?.finalizedAt && (
            <p>Finalized {new Date(report.finalizedAt).toLocaleString()}.</p>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="finalize-report" />
            <button className="button button-primary" disabled={navigation.state !== "idle"}>
              {report?.status === "final" ? "Regenerate final snapshot" : "Finalize report"}
            </button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Client delivery evidence</span>
          <h2>Record the delivery, not another document system.</h2>
          <p>
            Send the report through your normal client channel. AKARI records who
            received it and, if useful, a Drive or other external reference.
          </p>
          {closeout?.reportSentAt && (
            <p>
              Sent to {closeout.reportSentTo} on{" "}
              {new Date(closeout.reportSentAt).toLocaleString()}.
            </p>
          )}
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="mark-report-delivered" />
            <label>
              Recipient
              <input name="reportSentTo" maxLength={200} defaultValue={closeout?.reportSentTo ?? ""} required />
            </label>
            <label>
              External report / Drive link
              <input name="reportReferenceUrl" type="url" defaultValue={closeout?.reportReferenceUrl ?? ""} />
            </label>
            <button className="button button-primary" disabled={navigation.state !== "idle"}>
              Mark report delivered
            </button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Completion acknowledgement</span>
          <h2>Record whether the client acknowledged completion.</h2>
          <p>
            This is an operational CRM marker only. It is not a legal signature or
            agreement workflow.
          </p>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="record-client-acknowledgement" />
            <label>
              Acknowledgement
              <select name="clientAcknowledgementStatus" defaultValue={closeout?.clientAcknowledgementStatus ?? "acknowledged"}>
                <option value="acknowledged">Acknowledged</option>
                <option value="not_required">Explicit acknowledgement not required</option>
              </select>
            </label>
            <label>
              Note
              <textarea name="clientAcknowledgementNote" maxLength={1000} defaultValue={closeout?.clientAcknowledgementNote ?? ""} />
            </label>
            <button className="button button-quiet" disabled={navigation.state !== "idle"}>
              Record acknowledgement
            </button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Campaign completion</span>
          <h2>Close only after the commercial obligations are complete.</h2>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="close-campaign" />
            <label>
              Closeout note
              <textarea name="closeoutNote" minLength={10} maxLength={1000} defaultValue={closeout?.closeoutNote ?? ""} required />
            </label>
            <button className="button button-primary" disabled={navigation.state !== "idle" || Boolean(closeout?.closedAt)}>
              {closeout?.closedAt ? "Campaign closed" : "Close campaign"}
            </button>
          </Form>
        </section>

        <section className="admin-panel">
          <span className="chapter">Renewal and upsell</span>
          <h2>Record the commercial next step after closeout.</h2>
          <p>
            AKARI House does not map this to the Investor Opportunity system. Use an
            optional external CRM/reference link until the commercial CRM is
            connected to this product surface.
          </p>
          <Form method="post" className="profile-form">
            <input type="hidden" name="intent" value="save-renewal" />
            <div className="form-row form-row-three">
              <label>
                Next step
                <select name="renewalType" defaultValue={closeout?.renewalType ?? "none"}>
                  <option value="none">No renewal</option>
                  <option value="follow_up">Follow up later</option>
                  <option value="renew_campaign">Renew campaign</option>
                  <option value="retainer">Retainer opportunity</option>
                  <option value="upsell_service">Upsell another service</option>
                </select>
              </label>
              <label>
                Stage
                <select name="renewalStage" defaultValue={closeout?.renewalStage ?? "none"}>
                  <option value="none">No active follow-up</option>
                  <option value="planned">Planned</option>
                  <option value="converted">Converted</option>
                  <option value="declined">Declined</option>
                </select>
              </label>
              <label>
                Follow-up date
                <input name="renewalFollowUpAt" type="date" defaultValue={closeout?.renewalFollowUpAt?.slice(0, 10) ?? ""} />
              </label>
            </div>
            <label>
              Commercial CRM / reference link
              <input name="renewalReferenceUrl" type="url" defaultValue={closeout?.renewalReferenceUrl ?? ""} />
            </label>
            <label>
              Renewal note
              <textarea name="renewalNote" maxLength={1000} defaultValue={closeout?.renewalNote ?? ""} />
            </label>
            <button className="button button-primary" disabled={navigation.state !== "idle" || !closeout?.closedAt}>
              Save renewal outcome
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
