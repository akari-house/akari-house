import {
  expectedCampaignSlots,
  type PostingCadence,
} from "./campaign-delivery";

export async function createCampaignWorkReminders(
  env: CloudflareEnvironment,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const active = await env.DB.prepare(
    `SELECT c.id AS campaignId, c.slug, c.title, c.starts_at AS startsAt,
            c.ends_at AS endsAt, c.posting_cadence AS postingCadence,
            ca.id AS applicationId, ca.creator_user_id AS creatorUserId
     FROM ambassador_campaigns c
     JOIN campaign_applications ca ON ca.campaign_id = c.id
     WHERE c.status IN ('published', 'closed')
       AND ca.status = 'accepted'
       AND c.starts_at <= ? AND c.ends_at >= ?`,
  )
    .bind(today, today)
    .all<{
      campaignId: string;
      slug: string;
      title: string;
      startsAt: string;
      endsAt: string;
      postingCadence: PostingCadence;
      applicationId: string;
      creatorUserId: string;
    }>();
  for (const item of active.results) {
    const due = expectedCampaignSlots(
      item.startsAt,
      item.endsAt,
      item.postingCadence,
      now,
    );
    if (!due.length) continue;
    const submitted = await env.DB.prepare(
      `SELECT period_start AS periodStart, slot_number AS slotNumber
       FROM campaign_work_submissions
       WHERE application_id = ? AND status <> 'rejected'`,
    )
      .bind(item.applicationId)
      .all<{ periodStart: string; slotNumber: number }>();
    const completed = new Set(
      submitted.results.map(
        (submission) => `${submission.periodStart}|${submission.slotNumber}`,
      ),
    );
    const remaining = due.filter(
      (slot) => !completed.has(`${slot.periodStart}|${slot.slotNumber}`),
    ).length;
    if (!remaining) continue;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO notifications
       (id, user_id, kind, title, body, action_url)
       VALUES (?, ?, 'campaign.work_due', 'Campaign work is due', ?, ?)`,
    )
      .bind(
        `work-reminder:${item.campaignId}:${item.creatorUserId}:${today}`,
        item.creatorUserId,
        `${remaining} requirement${remaining === 1 ? "" : "s"} await a work link for ${item.title}.`,
        `/campaigns/${item.slug}/work`,
      )
      .run();
  }
}
