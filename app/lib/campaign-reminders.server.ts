import {
  expectedCampaignSlots,
  type PostingCadence,
} from "./campaign-delivery";
import { ensureCampaignOperationsSchema } from "./campaign-operations-schema.server";

type Reminder = {
  campaignId: string;
  userId: string;
  reminderType: string;
  key: string;
  title: string;
  body: string;
  actionUrl: string;
};

async function createReminder(db: D1Database, reminder: Reminder) {
  const notificationId = `campaign-reminder:${reminder.key}`;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO campaign_reminder_log
         (id, campaign_id, user_id, reminder_type, reminder_key, status, sent_at)
         VALUES (?, ?, ?, ?, ?, 'sent', datetime('now'))`,
      )
      .bind(
        crypto.randomUUID(),
        reminder.campaignId,
        reminder.userId,
        reminder.reminderType,
        reminder.key,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        notificationId,
        reminder.userId,
        `campaign.${reminder.reminderType}`,
        reminder.title,
        reminder.body,
        reminder.actionUrl,
      ),
  ]);
}

function dayDifference(date: string, today: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Math.round((target - current) / 86_400_000);
}

export async function createCampaignWorkReminders(
  env: CloudflareEnvironment,
  now = new Date(),
) {
  await ensureCampaignOperationsSchema(env.DB);
  const today = now.toISOString().slice(0, 10);
  const campaigns = await env.DB.prepare(
    `SELECT c.id AS campaignId, c.slug, c.title, c.status,
            c.application_deadline AS applicationDeadline,
            c.starts_at AS startsAt, c.ends_at AS endsAt,
            c.posting_cadence AS postingCadence,
            ca.id AS applicationId, ca.creator_user_id AS creatorUserId,
            ca.status AS applicationStatus
     FROM ambassador_campaigns c
     JOIN campaign_applications ca ON ca.campaign_id = c.id
     WHERE c.status IN ('published', 'closed')
       AND ca.status IN ('submitted', 'shortlisted', 'accepted')`,
  ).all<{
    campaignId: string;
    slug: string;
    title: string;
    status: string;
    applicationDeadline: string | null;
    startsAt: string;
    endsAt: string;
    postingCadence: PostingCadence;
    applicationId: string;
    creatorUserId: string;
    applicationStatus: string;
  }>();

  for (const item of campaigns.results) {
    const actionUrl = `/campaigns/${item.slug}`;
    if (item.applicationDeadline && item.applicationStatus !== "accepted") {
      const days = dayDifference(item.applicationDeadline, today);
      if (days === 1) {
        await createReminder(env.DB, {
          campaignId: item.campaignId,
          userId: item.creatorUserId,
          reminderType: "application_deadline",
          key: `${item.campaignId}:${item.creatorUserId}:application:${item.applicationDeadline}`,
          title: "Campaign applications close tomorrow",
          body: `${item.title} closes applications tomorrow. Review your application before the deadline.`,
          actionUrl,
        });
      }
    }

    if (item.applicationStatus !== "accepted") continue;
    const startDays = dayDifference(item.startsAt, today);
    const endDays = dayDifference(item.endsAt, today);
    if (startDays === 1 || startDays === 0) {
      await createReminder(env.DB, {
        campaignId: item.campaignId,
        userId: item.creatorUserId,
        reminderType: "starting",
        key: `${item.campaignId}:${item.creatorUserId}:start:${item.startsAt}`,
        title:
          startDays === 0
            ? "Campaign starts today"
            : "Campaign starts tomorrow",
        body: `${item.title} ${startDays === 0 ? "starts today" : "starts tomorrow"}. Review the brief and delivery schedule.`,
        actionUrl: `/campaigns/${item.slug}/work`,
      });
    }
    if (endDays === 1 || endDays === 0) {
      await createReminder(env.DB, {
        campaignId: item.campaignId,
        userId: item.creatorUserId,
        reminderType: "ending",
        key: `${item.campaignId}:${item.creatorUserId}:end:${item.endsAt}`,
        title: endDays === 0 ? "Campaign ends today" : "Campaign ends tomorrow",
        body: `${item.title} ${endDays === 0 ? "ends today" : "ends tomorrow"}. Submit any remaining work links.`,
        actionUrl: `/campaigns/${item.slug}/work`,
      });
    }

    if (item.startsAt <= today && item.endsAt >= today) {
      const due = expectedCampaignSlots(
        item.startsAt,
        item.endsAt,
        item.postingCadence,
        now,
      );
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
      if (remaining) {
        await createReminder(env.DB, {
          campaignId: item.campaignId,
          userId: item.creatorUserId,
          reminderType: "work_due",
          key: `${item.campaignId}:${item.creatorUserId}:work:${today}`,
          title: "Campaign work is due",
          body: `${remaining} requirement${remaining === 1 ? "" : "s"} await a work link for ${item.title}.`,
          actionUrl: `/campaigns/${item.slug}/work`,
        });
      }
    }
  }

  const settled = await env.DB.prepare(
    `SELECT c.id AS campaignId, c.slug, c.title,
            ca.creator_user_id AS creatorUserId,
            cs.updated_at AS updatedAt
     FROM campaign_settlements cs
     JOIN campaign_applications ca ON ca.id = cs.application_id
     JOIN ambassador_campaigns c ON c.id = ca.campaign_id
     WHERE cs.payment_status = 'paid'`,
  ).all<{
    campaignId: string;
    slug: string;
    title: string;
    creatorUserId: string;
    updatedAt: string;
  }>();
  for (const item of settled.results) {
    await createReminder(env.DB, {
      campaignId: item.campaignId,
      userId: item.creatorUserId,
      reminderType: "settlement_completed",
      key: `${item.campaignId}:${item.creatorUserId}:settled:${item.updatedAt}`,
      title: "Campaign settlement completed",
      body: `Your settlement record for ${item.title} is marked as paid.`,
      actionUrl: `/campaigns/${item.slug}/settlement`,
    });
  }
}
