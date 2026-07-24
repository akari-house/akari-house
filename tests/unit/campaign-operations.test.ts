import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../migrations/0095_campaign_ownership_reminders.sql",
    import.meta.url,
  ),
  "utf8",
);
const reminders = readFileSync(
  new URL("../../app/lib/campaign-reminders.server.ts", import.meta.url),
  "utf8",
);

describe("campaign operations release", () => {
  it("stores ownership, history and idempotent reminder evidence", () => {
    expect(migration).toContain("campaign_ownership");
    expect(migration).toContain("campaign_assignment_history");
    expect(migration).toContain("reminder_key TEXT NOT NULL UNIQUE");
  });

  it("covers the launch reminder lifecycle", () => {
    expect(reminders).toContain('reminderType: "application_deadline"');
    expect(reminders).toContain('reminderType: "starting"');
    expect(reminders).toContain('reminderType: "work_due"');
    expect(reminders).toContain('reminderType: "ending"');
    expect(reminders).toContain('reminderType: "settlement_completed"');
  });
});
