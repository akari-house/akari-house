import { describe, expect, it } from "vitest";
import { scheduledCrons, scheduledJobPlan } from "../../app/lib/scheduled-jobs";

describe("scheduled job plans", () => {
  it("runs House maintenance only on the daily trigger", () => {
    expect(scheduledJobPlan(scheduledCrons.daily)).toEqual([
      "social_metrics",
      "account_retention",
      "operational_resilience",
    ]);
  });

  it("does not run the retired House CRM operating rhythm job", () => {
    expect(scheduledJobPlan(scheduledCrons.daily)).not.toContain(
      "operating_rhythm",
    );
  });

  it("runs delivery work on the frequent trigger", () => {
    expect(scheduledJobPlan(scheduledCrons.frequent)).toEqual([
      "campaign_reminders",
      "telegram_notifications",
      "delivery_outbox",
    ]);
  });

  it("does not run jobs for an unknown trigger", () => {
    expect(scheduledJobPlan("1 2 3 4 5")).toEqual([]);
  });
});
