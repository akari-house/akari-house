import {
  applyAttentionStates,
  attentionKey,
  classifyDueDate,
  summarizeAttention,
  weeklyPeriod,
  type ActiveAttentionSignal,
  type AttentionSeverity,
  type AttentionSignal,
  type AttentionState,
  type OperatingReportType,
} from "./operating-rhythm";

type SignalInput = Omit<AttentionSignal, "attentionKey" | "severity"> & {
  severity?: AttentionSeverity;
};

function signal(input: SignalInput, now: Date): AttentionSignal {
  return {
    ...input,
    attentionKey: attentionKey(
      input.sourceType,
      input.sourceId,
      input.signalType,
    ),
    severity: input.severity ?? classifyDueDate(input.dueAt, now),
  };
}

function queueActionUrl(queueKey: string) {
  switch (queueKey) {
    case "membership":
      return "/admin/applications";
    case "verification":
      return "/admin/verifications";
    case "project_claim":
      return "/admin/project-claims";
    case "moderation":
      return "/admin/moderation";
    default:
      return "/admin/reviews";
  }
}

export async function loadAttentionSignals(db: D1Database, now = new Date()) {
  const signals: AttentionSignal[] = [];
  const [
    relationships,
    agreements,
    diligence,
    introductions,
    settlements,
    disputes,
    closeouts,
    renewals,
    reviewSla,
    fundraising,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, display_name AS displayName, company_name AS companyName,
              owner_user_id AS ownerUserId, project_id AS projectId,
              next_action_at AS dueAt, next_action AS nextAction
       FROM relationship_records
       WHERE status = 'active' AND consent_status <> 'opted_out'
         AND next_action_at IS NOT NULL`,
      )
      .all<{
        id: string;
        displayName: string;
        companyName: string;
        ownerUserId: string;
        projectId: string | null;
        dueAt: string;
        nextAction: string;
      }>(),
    db
      .prepare(
        `SELECT id, title, counterparty_name AS counterpartyName,
              owner_user_id AS ownerUserId, project_id AS projectId,
              status, next_follow_up_at AS nextFollowUpAt, expires_at AS expiresAt
       FROM agreement_records WHERE status NOT IN ('terminated', 'not_required')`,
      )
      .all<{
        id: string;
        title: string;
        counterpartyName: string;
        ownerUserId: string | null;
        projectId: string | null;
        status: string;
        nextFollowUpAt: string | null;
        expiresAt: string | null;
      }>(),
    db
      .prepare(
        `SELECT oqd.question_id AS id, oqd.project_id AS projectId,
              oqd.requested_category AS category, oqd.due_at AS dueAt,
              p.title AS projectTitle
       FROM opportunity_question_documents oqd
       JOIN opportunity_questions oq ON oq.id = oqd.question_id
       JOIN projects p ON p.id = oqd.project_id
       WHERE oqd.resolved_at IS NULL AND oq.status IN ('submitted', 'answered')`,
      )
      .all<{
        id: string;
        projectId: string;
        category: string;
        dueAt: string | null;
        projectTitle: string;
      }>(),
    db
      .prepare(
        `SELECT ir.id, ir.project_id AS projectId, p.title AS projectTitle
       FROM introduction_requests ir JOIN projects p ON p.id = ir.project_id
       WHERE ir.status = 'pending'`,
      )
      .all<{ id: string; projectId: string; projectTitle: string }>(),
    db
      .prepare(
        `SELECT cs.id, c.title AS campaignTitle, c.slug,
              cs.payment_status AS paymentStatus
       FROM campaign_settlements cs
       JOIN ambassador_campaigns c ON c.id = cs.campaign_id
       WHERE cs.payment_status IN ('pending', 'approved', 'processing', 'failed')`,
      )
      .all<{
        id: string;
        campaignTitle: string;
        slug: string;
        paymentStatus: string;
      }>(),
    db
      .prepare(
        `SELECT cd.id, c.title AS campaignTitle, c.slug, cd.status
       FROM campaign_disputes cd
       JOIN ambassador_campaigns c ON c.id = cd.campaign_id
       WHERE cd.status IN ('open', 'reviewing')`,
      )
      .all<{
        id: string;
        campaignTitle: string;
        slug: string;
        status: string;
      }>(),
    db
      .prepare(
        `SELECT cc.campaign_id AS id, c.title AS campaignTitle, c.slug, cc.status
       FROM campaign_closeouts cc
       JOIN ambassador_campaigns c ON c.id = cc.campaign_id
       WHERE cc.status IN ('awaiting_approvals', 'awaiting_settlement', 'reporting', 'client_delivered')`,
      )
      .all<{
        id: string;
        campaignTitle: string;
        slug: string;
        status: string;
      }>(),
    db
      .prepare(
        `SELECT cc.campaign_id AS id, c.title AS campaignTitle, c.slug,
              cc.renewal_follow_up_at AS dueAt
       FROM campaign_closeouts cc
       JOIN ambassador_campaigns c ON c.id = cc.campaign_id
       WHERE cc.renewal_stage = 'planned' AND cc.renewal_follow_up_at IS NOT NULL`,
      )
      .all<{
        id: string;
        campaignTitle: string;
        slug: string;
        dueAt: string;
      }>(),
    db
      .prepare(
        `SELECT rqs.item_key AS id, rqs.queue_key AS queueKey,
              rqs.assigned_to AS ownerUserId,
              datetime(COALESCE(rqs.waiting_since, rqs.updated_at),
                       '+' || rsp.target_hours || ' hours') AS dueAt
       FROM review_queue_state rqs
       JOIN review_sla_policies rsp ON rsp.queue_key = rqs.queue_key
       WHERE rsp.enabled = 1 AND rqs.waiting_on = 'akari'`,
      )
      .all<{
        id: string;
        queueKey: string;
        ownerUserId: string | null;
        dueAt: string;
      }>(),
    db
      .prepare(
        `SELECT ol.project_id AS id, p.title AS projectTitle, ol.closing_at AS dueAt
       FROM opportunity_listings ol JOIN projects p ON p.id = ol.project_id
       WHERE ol.status = 'published' AND ol.closing_at IS NOT NULL`,
      )
      .all<{ id: string; projectTitle: string; dueAt: string }>(),
  ]);

  for (const item of relationships.results) {
    const name = item.displayName || item.companyName || "Relationship";
    signals.push(
      signal(
        {
          sourceType: "relationship",
          sourceId: item.id,
          signalType: "next_action",
          title: `Follow up with ${name}`,
          detail: item.nextAction || "A relationship follow-up is due.",
          actionUrl: `/admin/relationships/${item.id}`,
          dueAt: item.dueAt,
          ownerUserId: item.ownerUserId,
          projectId: item.projectId,
        },
        now,
      ),
    );
  }
  for (const item of agreements.results) {
    if (item.nextFollowUpAt)
      signals.push(
        signal(
          {
            sourceType: "agreement",
            sourceId: item.id,
            signalType: "follow_up",
            title: `Agreement follow-up: ${item.title}`,
            detail: `Follow up with ${item.counterpartyName}. Current stage: ${item.status}.`,
            actionUrl: "/admin/agreements",
            dueAt: item.nextFollowUpAt,
            ownerUserId: item.ownerUserId,
            projectId: item.projectId,
          },
          now,
        ),
      );
    if (item.status === "signed" && item.expiresAt)
      signals.push(
        signal(
          {
            sourceType: "agreement",
            sourceId: item.id,
            signalType: "expiry",
            title: `Agreement expiry: ${item.title}`,
            detail: `${item.counterpartyName} agreement is approaching or past expiry.`,
            actionUrl: "/admin/agreements",
            dueAt: item.expiresAt,
            ownerUserId: item.ownerUserId,
            projectId: item.projectId,
          },
          now,
        ),
      );
  }
  for (const item of diligence.results)
    signals.push(
      signal(
        {
          sourceType: "diligence",
          sourceId: item.id,
          signalType: "request",
          title: `Diligence request: ${item.projectTitle}`,
          detail: `${item.category || "Requested"} diligence material still needs resolution.`,
          actionUrl: "/admin/diligence",
          dueAt: item.dueAt,
          ownerUserId: null,
          projectId: item.projectId,
        },
        now,
      ),
    );
  for (const item of introductions.results)
    signals.push(
      signal(
        {
          sourceType: "introduction",
          sourceId: item.id,
          signalType: "pending",
          title: `Investor introduction: ${item.projectTitle}`,
          detail: "An investor introduction request is awaiting AKARI review.",
          actionUrl: "/admin/opportunities",
          dueAt: null,
          ownerUserId: null,
          projectId: item.projectId,
          severity: "watch",
        },
        now,
      ),
    );
  for (const item of settlements.results)
    signals.push(
      signal(
        {
          sourceType: "settlement",
          sourceId: item.id,
          signalType: item.paymentStatus,
          title: `Settlement ${item.paymentStatus}: ${item.campaignTitle}`,
          detail: `Campaign settlement is currently ${item.paymentStatus}.`,
          actionUrl: `/admin/campaign-compensation/${item.slug}`,
          dueAt: null,
          ownerUserId: null,
          projectId: null,
          severity: item.paymentStatus === "failed" ? "overdue" : "watch",
        },
        now,
      ),
    );
  for (const item of disputes.results)
    signals.push(
      signal(
        {
          sourceType: "dispute",
          sourceId: item.id,
          signalType: item.status,
          title: `Campaign dispute: ${item.campaignTitle}`,
          detail: `A creator dispute is ${item.status} and needs an operational decision.`,
          actionUrl: `/admin/campaign-compensation/${item.slug}`,
          dueAt: null,
          ownerUserId: null,
          projectId: null,
          severity: "watch",
        },
        now,
      ),
    );
  for (const item of closeouts.results)
    signals.push(
      signal(
        {
          sourceType: "campaign_closeout",
          sourceId: item.id,
          signalType: item.status,
          title: `Campaign closeout: ${item.campaignTitle}`,
          detail: `Closeout is at ${item.status.replaceAll("_", " ")}.`,
          actionUrl: `/campaigns/${item.slug}/closeout`,
          dueAt: null,
          ownerUserId: null,
          projectId: null,
          severity: "watch",
        },
        now,
      ),
    );
  for (const item of renewals.results)
    signals.push(
      signal(
        {
          sourceType: "campaign_renewal",
          sourceId: item.id,
          signalType: "follow_up",
          title: `Renewal follow-up: ${item.campaignTitle}`,
          detail: "A planned campaign renewal or upsell follow-up is due.",
          actionUrl: `/campaigns/${item.slug}/closeout`,
          dueAt: item.dueAt,
          ownerUserId: null,
          projectId: null,
        },
        now,
      ),
    );
  for (const item of reviewSla.results)
    signals.push(
      signal(
        {
          sourceType: "review_sla",
          sourceId: item.id,
          signalType: item.queueKey,
          title: `${item.queueKey.replaceAll("_", " ")} review SLA`,
          detail: "This review queue item is waiting on AKARI.",
          actionUrl: queueActionUrl(item.queueKey),
          dueAt: item.dueAt,
          ownerUserId: item.ownerUserId,
          projectId: null,
        },
        now,
      ),
    );
  for (const item of fundraising.results)
    signals.push(
      signal(
        {
          sourceType: "fundraising",
          sourceId: item.id,
          signalType: "closing",
          title: `Fundraising close: ${item.projectTitle}`,
          detail:
            "A published fundraising opportunity has a closing date to track.",
          actionUrl: "/admin/opportunities",
          dueAt: item.dueAt,
          ownerUserId: null,
          projectId: item.id,
        },
        now,
      ),
    );
  return signals;
}

export async function loadAttentionStates(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT attention_key AS attentionKey, status, assigned_to AS assignedTo,
            snoozed_until AS snoozedUntil, note FROM attention_item_states`,
    )
    .all<AttentionState>();
  return result.results;
}

export async function loadActiveAttention(db: D1Database, now = new Date()) {
  const [signals, states] = await Promise.all([
    loadAttentionSignals(db, now),
    loadAttentionStates(db),
  ]);
  return applyAttentionStates(signals, states, now);
}

function reportSignals(
  reportType: OperatingReportType,
  signals: ActiveAttentionSignal[],
  projectId: string | null,
) {
  if (reportType === "founder_weekly")
    return signals.filter((item) => projectId && item.projectId === projectId);
  if (reportType === "fundraising_pipeline")
    return signals.filter((item) =>
      ["fundraising", "diligence", "introduction", "agreement"].includes(
        item.sourceType,
      ),
    );
  if (reportType === "campaign_portfolio")
    return signals.filter((item) =>
      [
        "settlement",
        "dispute",
        "campaign_closeout",
        "campaign_renewal",
      ].includes(item.sourceType),
    );
  if (reportType === "relationship_followup")
    return signals.filter((item) => item.sourceType === "relationship");
  return signals;
}

export async function createOperatingReport(
  db: D1Database,
  options: {
    reportType: OperatingReportType;
    projectId?: string | null;
    createdBy?: string | null;
    generationSource?: "manual" | "scheduled";
    now?: Date;
  },
) {
  const now = options.now ?? new Date();
  const projectId = options.projectId ?? null;
  const period = weeklyPeriod(now);
  const active = await loadActiveAttention(db, now);
  const items = reportSignals(options.reportType, active, projectId);
  const snapshot = {
    generatedAt: now.toISOString(),
    period,
    reportType: options.reportType,
    projectId,
    summary: summarizeAttention(items),
    items: items
      .slice(0, 250)
      .map((item) => ({
        attentionKey: item.attentionKey,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        title: item.title,
        severity: item.severity,
        dueAt: item.dueAt,
        assignedTo: item.assignedTo,
        projectId: item.projectId,
        actionUrl: item.actionUrl,
      })),
  };
  await db
    .prepare(
      `INSERT OR IGNORE INTO operating_report_runs
     (id, report_type, project_id, period_start, period_end, status,
      generation_source, snapshot_json, created_by, finalized_by, finalized_at)
     VALUES (?, ?, ?, ?, ?, 'finalized', ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      options.reportType,
      projectId,
      period.start,
      period.end,
      options.generationSource ?? "manual",
      JSON.stringify(snapshot),
      options.createdBy ?? null,
      options.createdBy ?? null,
    )
    .run();
  return snapshot;
}

async function adminRecipients(db: D1Database) {
  const rows = await db
    .prepare(
      `SELECT au.user_id AS userId, au.access_level AS accessLevel
     FROM admin_users au JOIN users u ON u.id = au.user_id WHERE u.status = 'active'`,
    )
    .all<{ userId: string; accessLevel: string }>();
  return rows.results;
}

export async function syncOperatingRhythm(
  env: CloudflareEnvironment,
  now = new Date(),
) {
  const active = await loadActiveAttention(env.DB, now);
  const recipients = await adminRecipients(env.DB);
  const adminIds = new Set(recipients.map((item) => item.userId));
  const superadminIds = recipients
    .filter((item) => item.accessLevel === "superadmin")
    .map((item) => item.userId);
  const dayKey = now.toISOString().slice(0, 10);
  for (const item of active) {
    if (item.severity === "watch") continue;
    const directRecipient = item.assignedTo ?? item.ownerUserId;
    const recipientIds =
      directRecipient && adminIds.has(directRecipient)
        ? [directRecipient]
        : superadminIds;
    for (const userId of recipientIds) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO notifications
         (id, user_id, kind, title, body, action_url) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `operating:${dayKey}:${userId}:${item.attentionKey}`,
          userId,
          `operating.${item.sourceType}`,
          item.title,
          item.detail,
          item.actionUrl,
        )
        .run();
    }
  }
  if (now.getUTCDay() === 1)
    await createOperatingReport(env.DB, {
      reportType: "management_weekly",
      generationSource: "scheduled",
      now,
    });
}
