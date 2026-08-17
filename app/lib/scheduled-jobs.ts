export const scheduledCrons = {
  daily: "0 3 * * *",
  frequent: "*/5 * * * *",
} as const;

export type ScheduledJobName =
  | "social_metrics"
  | "campaign_reminders"
  | "telegram_notifications"
  | "delivery_outbox"
  | "account_retention"
  | "operational_resilience"
  | "operating_rhythm";

const jobPlans: Record<string, readonly ScheduledJobName[]> = {
  [scheduledCrons.daily]: [
    "social_metrics",
    "account_retention",
    "operational_resilience",
    "operating_rhythm",
  ],
  [scheduledCrons.frequent]: [
    "campaign_reminders",
    "telegram_notifications",
    "delivery_outbox",
  ],
};

export function scheduledJobPlan(cron: string): readonly ScheduledJobName[] {
  return jobPlans[cron] ?? [];
}
