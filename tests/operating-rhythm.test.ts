import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAttentionStates,
  attentionKey,
  classifyDueDate,
  summarizeAttention,
  weeklyPeriod,
  type AttentionSignal,
} from "../app/lib/operating-rhythm";

function signal(overrides: Partial<AttentionSignal> = {}): AttentionSignal {
  return {
    attentionKey: "relationship:r1:next_action",
    sourceType: "relationship",
    sourceId: "r1",
    signalType: "next_action",
    title: "Follow up",
    detail: "Follow up with an investor.",
    actionUrl: "/admin/relationships/r1",
    dueAt: "2026-08-17T12:00:00Z",
    ownerUserId: "admin-1",
    projectId: null,
    severity: "today",
    ...overrides,
  };
}

describe("R74 operating rhythm", () => {
  it("classifies overdue, today, soon and watch dates deterministically", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(classifyDueDate("2026-08-16T23:00:00Z", now)).toBe("overdue");
    expect(classifyDueDate("2026-08-17T23:00:00Z", now)).toBe("today");
    expect(classifyDueDate("2026-08-22T12:00:00Z", now)).toBe("soon");
    expect(classifyDueDate("2026-09-30T12:00:00Z", now)).toBe("watch");
    expect(classifyDueDate(null, now)).toBe("watch");
  });

  it("uses stable source keys instead of duplicating business records", () => {
    expect(attentionKey("agreement", "a-1", "expiry")).toBe(
      "agreement:a-1:expiry",
    );
  });

  it("hides resolved, ignored and actively snoozed items", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    const signals = [
      signal({ attentionKey: "one" }),
      signal({ attentionKey: "two" }),
      signal({ attentionKey: "three" }),
      signal({ attentionKey: "four" }),
    ];
    const active = applyAttentionStates(
      signals,
      [
        { attentionKey: "one", status: "resolved", assignedTo: null, snoozedUntil: null, note: "" },
        { attentionKey: "two", status: "ignored", assignedTo: null, snoozedUntil: null, note: "" },
        { attentionKey: "three", status: "snoozed", assignedTo: null, snoozedUntil: "2026-08-18T00:00:00Z", note: "" },
        { attentionKey: "four", status: "snoozed", assignedTo: "admin-2", snoozedUntil: "2026-08-16T00:00:00Z", note: "ready" },
      ],
      now,
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.attentionKey).toBe("four");
    expect(active[0]?.assignedTo).toBe("admin-2");
  });

  it("prioritizes overdue work before today, soon and watch", () => {
    const active = applyAttentionStates(
      [
        signal({ attentionKey: "watch", severity: "watch", dueAt: null }),
        signal({ attentionKey: "soon", severity: "soon", dueAt: "2026-08-20T12:00:00Z" }),
        signal({ attentionKey: "overdue", severity: "overdue", dueAt: "2026-08-16T12:00:00Z" }),
        signal({ attentionKey: "today", severity: "today" }),
      ],
      [],
      new Date("2026-08-17T12:00:00Z"),
    );
    expect(active.map((item) => item.attentionKey)).toEqual([
      "overdue",
      "today",
      "soon",
      "watch",
    ]);
  });

  it("builds Monday-to-Sunday weekly report periods", () => {
    expect(weeklyPeriod(new Date("2026-08-17T20:00:00Z"))).toEqual({
      start: "2026-08-17",
      end: "2026-08-23",
    });
    expect(weeklyPeriod(new Date("2026-08-20T20:00:00Z"))).toEqual({
      start: "2026-08-17",
      end: "2026-08-23",
    });
  });

  it("summarizes attention without converting operational state into a quality score", () => {
    const summary = summarizeAttention(
      applyAttentionStates(
        [
          signal({ attentionKey: "a", sourceType: "relationship", severity: "overdue" }),
          signal({ attentionKey: "b", sourceType: "agreement", severity: "soon" }),
        ],
        [],
      ),
    );
    expect(summary.total).toBe(2);
    expect(summary.severity.overdue).toBe(1);
    expect(summary.source.relationship).toBe(1);
    expect(summary.source.agreement).toBe(1);
  });

  it("keeps R74 additive and Superadmin-only", () => {
    const migration = readFileSync(
      "migrations/0120_reporting_notifications_operating_rhythm.sql",
      "utf8",
    );
    const route = readFileSync("app/routes/admin-operating-rhythm.tsx", "utf8");
    const worker = readFileSync("worker/index.ts", "utf8");
    expect(migration).toContain("CREATE TABLE attention_item_states");
    expect(migration).toContain("CREATE TABLE operating_report_runs");
    expect(migration).not.toContain("DROP TABLE");
    expect(route).toContain("requireSuperAdmin");
    expect(route).toContain("What needs AKARI attention now.");
    expect(worker).toContain("syncOperatingRhythm");
  });
});
