import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/iio-settlement";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureIioSettlementSchema } from "~/lib/iio-settlement-schema.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  currency: string;
  finalizedAt: string | null;
  endsAt: string | null;
};

type SettlementRow = {
  id: string | null;
  applicationId: string;
  creatorUserId: string;
  creatorName: string;
  username: string;
  originalAllocationCents: number;
  calculatedFinalCents: number | null;
  finalAmountCents: number | null;
  settlementType: string | null;
  tokenSymbol: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  evidenceReference: string | null;
  transactionReference: string | null;
  internalNote: string | null;
  paidAt: string | null;
};

type DisputeRow = {
  id: string;
  applicationId: string;
  creatorUserId: string;
  creatorName: string;
  disputeType: string;
  description: string;
  evidenceUrl: string | null;
  status: string;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

async function getCampaign(db: D1Database, slug: string | undefined) {
  return db
    .prepare(
      `SELECT id, slug, title, currency, finalized_at AS finalizedAt,
              ends_at AS endsAt
       FROM ambassador_campaigns
       WHERE slug = ? AND campaign_kind = 'iio'`,
    )
    .bind(slug)
    .first<CampaignRow>();
}

async function canModerate(db: D1Database, userId: string, campaignId: string) {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 FROM admin_users au
         LEFT JOIN admin_scopes s ON s.admin_user_id = au.user_id
           AND s.scope IN ('campaigns', 'moderation')
         LEFT JOIN campaign_moderators cm
           ON cm.user_id = au.user_id AND cm.campaign_id = ?
         WHERE au.user_id = ?
           AND (au.access_level = 'superadmin' OR s.scope IS NOT NULL
                OR cm.user_id IS NOT NULL)`,
      )
      .bind(campaignId, userId)
      .first(),
  );
}

async function getSettlements(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT cs.id, ca.id AS applicationId,
                ca.creator_user_id AS creatorUserId,
                p.display_name AS creatorName, u.username,
                ca.payout_cents AS originalAllocationCents,
                ca.final_payout_cents AS calculatedFinalCents,
                cs.final_amount_cents AS finalAmountCents,
                cs.settlement_type AS settlementType,
                cs.token_symbol AS tokenSymbol,
                cs.payment_status AS paymentStatus,
                cs.payment_method AS paymentMethod,
                cs.evidence_reference AS evidenceReference,
                cs.transaction_reference AS transactionReference,
                cs.internal_note AS internalNote, cs.paid_at AS paidAt
         FROM campaign_applications ca
         JOIN users u ON u.id = ca.creator_user_id
         JOIN profiles p ON p.user_id = ca.creator_user_id
         LEFT JOIN campaign_settlements cs ON cs.application_id = ca.id
         WHERE ca.campaign_id = ? AND ca.status = 'accepted'
         ORDER BY p.display_name`,
      )
      .bind(campaignId)
      .all<SettlementRow>()
  ).results;
}

async function getDisputes(db: D1Database, campaignId: string) {
  return (
    await db
      .prepare(
        `SELECT cd.id, cd.application_id AS applicationId,
                cd.creator_user_id AS creatorUserId,
                p.display_name AS creatorName,
                cd.dispute_type AS disputeType, cd.description,
                cd.evidence_url AS evidenceUrl, cd.status,
                cd.resolution_note AS resolutionNote,
                cd.created_at AS createdAt, cd.resolved_at AS resolvedAt
         FROM campaign_disputes cd
         JOIN profiles p ON p.user_id = cd.creator_user_id
         WHERE cd.campaign_id = ? ORDER BY cd.created_at DESC`,
      )
      .bind(campaignId)
      .all<DisputeRow>()
  ).results;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  await ensureIioSettlementSchema(db);
  const user = await requireApprovedMember(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const moderator = await canModerate(db, user.id, campaign.id);
  const settlements = await getSettlements(db, campaign.id);
  const ownSettlement = settlements.find(
    (item) => item.creatorUserId === user.id,
  );
  if (!moderator && !ownSettlement)
    throw new Response("Accepted Creators only.", { status: 403 });
  const disputes = await getDisputes(db, campaign.id);
  const adjustments = moderator
    ? (
        await db
          .prepare(
            `SELECT csa.id, csa.settlement_id AS settlementId,
                    csa.previous_amount_cents AS previousAmountCents,
                    csa.new_amount_cents AS newAmountCents, csa.reason,
                    p.display_name AS createdByName,
                    csa.created_at AS createdAt
             FROM campaign_settlement_adjustments csa
             JOIN profiles p ON p.user_id = csa.created_by
             JOIN campaign_settlements cs ON cs.id = csa.settlement_id
             WHERE cs.campaign_id = ? ORDER BY csa.created_at DESC`,
          )
          .bind(campaign.id)
          .all<{
            id: string;
            settlementId: string;
            previousAmountCents: number;
            newAmountCents: number;
            reason: string;
            createdByName: string;
            createdAt: string;
          }>()
      ).results
    : [];
  const report = await db
    .prepare(
      `SELECT status, generated_at AS generatedAt, finalized_at AS finalizedAt
       FROM campaign_final_reports WHERE campaign_id = ?`,
    )
    .bind(campaign.id)
    .first<{
      status: string;
      generatedAt: string;
      finalizedAt: string | null;
    }>();
  return {
    user,
    campaign,
    moderator,
    settlements: moderator ? settlements : ownSettlement ? [ownSettlement] : [],
    disputes: moderator
      ? disputes
      : disputes.filter((item) => item.creatorUserId === user.id),
    adjustments,
    report,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  await ensureIioSettlementSchema(db);
  const user = await requireApprovedMember(request, db);
  const campaign = await getCampaign(db, params.slug);
  if (!campaign) throw new Response("IIO not found.", { status: 404 });
  const moderator = await canModerate(db, user.id, campaign.id);
  const form = await request.formData();
  const intent = formText(form.get("intent"));

  if (intent === "open-dispute") {
    const application = await db
      .prepare(
        `SELECT id FROM campaign_applications
         WHERE campaign_id = ? AND creator_user_id = ? AND status = 'accepted'`,
      )
      .bind(campaign.id, user.id)
      .first<{ id: string }>();
    if (!application)
      throw new Response("Accepted Creator required.", { status: 403 });
    const disputeType = formText(form.get("disputeType"));
    const description = formText(form.get("description")).trim();
    const evidenceUrl = formText(form.get("evidenceUrl")).trim();
    if (
      ![
        "missing_submission",
        "rejected_submission",
        "allocation",
        "settlement",
        "other",
      ].includes(disputeType) ||
      description.length < 20 ||
      description.length > 1500 ||
      (evidenceUrl &&
        (!URL.canParse(evidenceUrl) ||
          !["http:", "https:"].includes(new URL(evidenceUrl).protocol)))
    )
      return {
        error:
          "Add a clear dispute description and optional valid evidence URL.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_disputes
           (id, campaign_id, application_id, creator_user_id,
            dispute_type, description, evidence_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          application.id,
          user.id,
          disputeType,
          description,
          evidenceUrl || null,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.dispute_opened', 'campaign', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          campaign.id,
          JSON.stringify({ disputeType }),
        ),
    ]);
    throw redirect(`/campaigns/${campaign.slug}/settlement?dispute=opened`);
  }

  if (!moderator)
    throw new Response("Campaign moderation required.", { status: 403 });

  if (intent === "save-settlement") {
    const applicationId = formText(form.get("applicationId"));
    const application = await db
      .prepare(
        `SELECT creator_user_id AS creatorUserId, payout_cents AS payoutCents,
                final_payout_cents AS finalPayoutCents
         FROM campaign_applications
         WHERE id = ? AND campaign_id = ? AND status = 'accepted'`,
      )
      .bind(applicationId, campaign.id)
      .first<{
        creatorUserId: string;
        payoutCents: number;
        finalPayoutCents: number | null;
      }>();
    if (!application) throw new Response("Creator not found.", { status: 404 });
    const amount = Number(formText(form.get("amount")));
    const finalAmountCents = Math.round(amount * 100);
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
      [
        tokenSymbol,
        paymentMethod,
        evidenceReference,
        transactionReference,
      ].some((value) => value.length > 200) ||
      internalNote.length > 1000
    )
      return {
        error: "Check the settlement amount, type, status and references.",
      };
    const existing = await db
      .prepare(
        `SELECT id, final_amount_cents AS finalAmountCents
         FROM campaign_settlements WHERE application_id = ?`,
      )
      .bind(applicationId)
      .first<{ id: string; finalAmountCents: number }>();
    if (
      existing &&
      existing.finalAmountCents !== finalAmountCents &&
      adjustmentReason.length < 10
    )
      return { error: "Explain any change to an existing final amount." };
    const settlementId = existing?.id ?? crypto.randomUUID();
    const paidAt = paymentStatus === "paid" ? "datetime('now')" : "NULL";
    const statements = [
      db
        .prepare(
          `INSERT INTO campaign_settlements
           (id, campaign_id, application_id, creator_user_id,
            original_allocation_cents, final_amount_cents, settlement_type,
            currency, token_symbol, payment_status, payment_method,
            evidence_reference, transaction_reference, internal_note,
            approved_by, approved_at, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ${paidAt})
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
               THEN COALESCE(campaign_settlements.paid_at, datetime('now')) ELSE NULL END,
             updated_at = datetime('now')`,
        )
        .bind(
          settlementId,
          campaign.id,
          applicationId,
          application.creatorUserId,
          application.payoutCents,
          finalAmountCents,
          settlementType,
          campaign.currency,
          tokenSymbol || null,
          paymentStatus,
          paymentMethod || null,
          evidenceReference || null,
          transactionReference || null,
          internalNote || null,
          user.id,
        ),
      db
        .prepare(
          `UPDATE campaign_applications SET final_payout_cents = ?,
           payout_decided_by = ?, payout_decided_at = datetime('now'),
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(finalAmountCents, user.id, applicationId),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.settlement_saved', 'campaign_application', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          applicationId,
          JSON.stringify({ finalAmountCents, settlementType, paymentStatus }),
        ),
    ];
    if (existing && existing.finalAmountCents !== finalAmountCents)
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
            existing.finalAmountCents,
            finalAmountCents,
            adjustmentReason,
            user.id,
          ),
      );
    await db.batch(statements);
    throw redirect(`/campaigns/${campaign.slug}/settlement?saved=1`);
  }

  if (intent === "resolve-dispute") {
    const disputeId = formText(form.get("disputeId"));
    const status = formText(form.get("status"));
    const resolutionNote = formText(form.get("resolutionNote")).trim();
    if (
      !["reviewing", "resolved", "declined"].includes(status) ||
      resolutionNote.length < 10 ||
      resolutionNote.length > 1000
    )
      return {
        error: "Choose a dispute decision and record a clear resolution note.",
      };
    const dispute = await db
      .prepare(
        `SELECT creator_user_id AS creatorUserId FROM campaign_disputes
         WHERE id = ? AND campaign_id = ?`,
      )
      .bind(disputeId, campaign.id)
      .first<{ creatorUserId: string }>();
    if (!dispute) throw new Response("Dispute not found.", { status: 404 });
    await db.batch([
      db
        .prepare(
          `UPDATE campaign_disputes SET status = ?, resolution_note = ?,
           resolved_by = ?, resolved_at = CASE WHEN ? IN ('resolved', 'declined')
             THEN datetime('now') ELSE NULL END,
           updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(status, resolutionNote, user.id, status, disputeId),
      db
        .prepare(
          `INSERT INTO notifications
           (id, user_id, kind, title, body, action_url)
           VALUES (?, ?, 'campaign.dispute_updated', 'Campaign dispute updated', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          dispute.creatorUserId,
          `Your dispute for ${campaign.title} is now ${status}.`,
          `/campaigns/${campaign.slug}/settlement`,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs
           (id, actor_user_id, action, subject_type, subject_id, metadata_json)
           VALUES (?, ?, 'campaign.dispute_resolved', 'campaign_dispute', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          disputeId,
          JSON.stringify({ status, resolutionNote }),
        ),
    ]);
    throw redirect(`/campaigns/${campaign.slug}/settlement?dispute=updated`);
  }

  if (intent === "finalize-report") {
    const settlements = await getSettlements(db, campaign.id);
    const disputes = await getDisputes(db, campaign.id);
    const summary = {
      campaignId: campaign.id,
      generatedAt: new Date().toISOString(),
      creators: settlements.length,
      originalAllocationCents: settlements.reduce(
        (total, item) => total + item.originalAllocationCents,
        0,
      ),
      finalAmountCents: settlements.reduce(
        (total, item) =>
          total + (item.finalAmountCents ?? item.calculatedFinalCents ?? 0),
        0,
      ),
      paidCreators: settlements.filter((item) => item.paymentStatus === "paid")
        .length,
      openDisputes: disputes.filter((item) =>
        ["open", "reviewing"].includes(item.status),
      ).length,
    };
    if (summary.openDisputes > 0)
      return {
        error:
          "Resolve every open dispute before finalizing the campaign report.",
      };
    await db.batch([
      db
        .prepare(
          `INSERT INTO campaign_final_reports
           (id, campaign_id, status, generated_by, finalized_at, summary_json)
           VALUES (?, ?, 'final', ?, datetime('now'), ?)
           ON CONFLICT(campaign_id) DO UPDATE SET status = 'final',
             generated_by = excluded.generated_by,
             generated_at = datetime('now'), finalized_at = datetime('now'),
             summary_json = excluded.summary_json`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          user.id,
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
          user.id,
          campaign.id,
          JSON.stringify(summary),
        ),
    ]);
    throw redirect(`/campaigns/${campaign.slug}/settlement?report=final`);
  }

  throw new Response("Unsupported action.", { status: 400 });
}

export default function IioSettlement({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const { campaign, moderator } = loaderData;
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: campaign.currency,
  });
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <Link className="quiet-link" to={`/campaigns/${campaign.slug}/work`}>
          Back to campaign workroom
        </Link>
        <header className="admin-heading">
          <div>
            <span className="eyebrow">IIO settlement & disputes</span>
            <h1>{campaign.title}</h1>
            <p>
              Finalize allocations, record external settlement and resolve
              corrections without overwriting history.
            </p>
          </div>
          {moderator && (
            <a
              className="button button-quiet"
              href={`/admin/iio/${campaign.slug}/settlement.csv`}
            >
              Export final CSV
            </a>
          )}
        </header>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {loaderData.report?.status === "final" && (
          <p className="notice success">
            Final campaign report generated{" "}
            {new Date(loaderData.report.generatedAt).toLocaleString()}.
          </p>
        )}
        {loaderData.settlements.map((item) => {
          const currentAmount =
            item.finalAmountCents ??
            item.calculatedFinalCents ??
            item.originalAllocationCents;
          return (
            <section className="admin-panel" key={item.applicationId}>
              <span className="chapter">
                {moderator ? item.creatorName : "Your settlement"}
              </span>
              <h2>{money.format(currentAmount / 100)}</h2>
              <p>
                Original allocation:{" "}
                {money.format(item.originalAllocationCents / 100)} · Status:{" "}
                {item.paymentStatus ?? "pending"}
              </p>
              {item.transactionReference && (
                <p>
                  <strong>Transaction reference:</strong>{" "}
                  {item.transactionReference}
                </p>
              )}
              {item.evidenceReference && (
                <p>
                  <strong>Evidence:</strong> {item.evidenceReference}
                </p>
              )}
              {moderator && (
                <Form method="post" className="profile-form">
                  <input type="hidden" name="intent" value="save-settlement" />
                  <input
                    type="hidden"
                    name="applicationId"
                    value={item.applicationId}
                  />
                  <div className="form-row">
                    <label>
                      Final amount ({campaign.currency})
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={currentAmount / 100}
                        required
                      />
                    </label>
                    <label>
                      Settlement type
                      <select
                        name="settlementType"
                        defaultValue={item.settlementType ?? "cash"}
                      >
                        <option value="cash">Cash</option>
                        <option value="token">Token</option>
                        <option value="mixed">Mixed</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Payment status
                      <select
                        name="paymentStatus"
                        defaultValue={item.paymentStatus ?? "pending"}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="processing">Processing</option>
                        <option value="paid">Paid</option>
                        <option value="failed">Failed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row">
                    <label>
                      Token symbol
                      <input
                        name="tokenSymbol"
                        maxLength={20}
                        defaultValue={item.tokenSymbol ?? ""}
                      />
                    </label>
                    <label>
                      Payment method
                      <input
                        name="paymentMethod"
                        maxLength={200}
                        defaultValue={item.paymentMethod ?? ""}
                      />
                    </label>
                  </div>
                  <label>
                    Transaction reference
                    <input
                      name="transactionReference"
                      maxLength={200}
                      defaultValue={item.transactionReference ?? ""}
                    />
                  </label>
                  <label>
                    Payment evidence or invoice reference
                    <input
                      name="evidenceReference"
                      maxLength={200}
                      defaultValue={item.evidenceReference ?? ""}
                    />
                  </label>
                  <label>
                    Adjustment reason
                    <input
                      name="adjustmentReason"
                      maxLength={500}
                      placeholder="Required when changing a saved final amount."
                    />
                  </label>
                  <label>
                    Internal note
                    <textarea
                      name="internalNote"
                      rows={3}
                      maxLength={1000}
                      defaultValue={item.internalNote ?? ""}
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={navigation.state !== "idle"}
                  >
                    Save settlement
                  </button>
                </Form>
              )}
            </section>
          );
        })}
        {!moderator && (
          <section className="admin-panel">
            <span className="chapter">Correction or dispute</span>
            <h2>Raise a traceable review request</h2>
            <Form method="post" className="profile-form">
              <input type="hidden" name="intent" value="open-dispute" />
              <label>
                Issue type
                <select name="disputeType" defaultValue="settlement">
                  <option value="missing_submission">Missing submission</option>
                  <option value="rejected_submission">
                    Rejected submission
                  </option>
                  <option value="allocation">Allocation</option>
                  <option value="settlement">Settlement</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                What should be reviewed?
                <textarea
                  name="description"
                  rows={5}
                  minLength={20}
                  maxLength={1500}
                  required
                />
              </label>
              <label>
                Evidence URL
                <input name="evidenceUrl" type="url" />
              </label>
              <button className="button button-primary">
                Submit review request
              </button>
            </Form>
          </section>
        )}
        <section className="admin-panel">
          <span className="chapter">Dispute history</span>
          <h2>Corrections and decisions</h2>
          {loaderData.disputes.map((dispute) => (
            <article className="application-card" key={dispute.id}>
              <div>
                <span className="chapter">
                  {dispute.disputeType.replaceAll("_", " ")} · {dispute.status}
                </span>
                <h3>{dispute.creatorName}</h3>
                <p>{dispute.description}</p>
                {dispute.evidenceUrl && (
                  <a
                    href={dispute.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open evidence
                  </a>
                )}
                {dispute.resolutionNote && (
                  <p>
                    <strong>Decision:</strong> {dispute.resolutionNote}
                  </p>
                )}
              </div>
              {moderator && ["open", "reviewing"].includes(dispute.status) && (
                <Form method="post" className="application-actions">
                  <input type="hidden" name="intent" value="resolve-dispute" />
                  <input type="hidden" name="disputeId" value={dispute.id} />
                  <label>
                    Status
                    <select name="status" defaultValue="reviewing">
                      <option value="reviewing">Reviewing</option>
                      <option value="resolved">Resolved</option>
                      <option value="declined">Declined</option>
                    </select>
                  </label>
                  <label>
                    Resolution note
                    <textarea
                      name="resolutionNote"
                      minLength={10}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <button className="button button-primary">
                    Save decision
                  </button>
                </Form>
              )}
            </article>
          ))}
          {!loaderData.disputes.length && <p>No disputes have been raised.</p>}
        </section>
        {moderator && loaderData.adjustments.length > 0 && (
          <section className="admin-panel">
            <span className="chapter">Adjustment history</span>
            <h2>Original decisions remain visible</h2>
            {loaderData.adjustments.map((adjustment) => (
              <p key={adjustment.id}>
                {money.format(adjustment.previousAmountCents / 100)} →{" "}
                {money.format(adjustment.newAmountCents / 100)} ·{" "}
                {adjustment.reason} · {adjustment.createdByName}
              </p>
            ))}
          </section>
        )}
        {moderator && (
          <section className="admin-panel">
            <span className="chapter">Final campaign report</span>
            <h2>Lock the operational outcome</h2>
            <p>
              The final report summarizes allocations, settlements, payment
              status and resolved disputes.
            </p>
            <Form method="post">
              <button
                className="button button-primary"
                name="intent"
                value="finalize-report"
              >
                Generate final report
              </button>
            </Form>
          </section>
        )}
      </main>
    </div>
  );
}
