import { describe, expect, it } from "vitest";
import {
  calculateReviewSla,
  reviewSlaPriorityBoost,
} from "../app/lib/review-sla";

const started = "2026-08-10 00:00:00";
const now = Date.parse("2026-08-12T00:00:00Z");

describe("R76H review SLA engine", () => {
  it("marks an active review overdue after its target", () => {
    const sla = calculateReviewSla({
      submittedAt: started,
      targetHours: 24,
      waitingOn: "akari",
      now,
    });

    expect(sla.state).toBe("overdue");
    expect(sla.ageHours).toBe(48);
    expect(reviewSlaPriorityBoost(sla)).toBeGreaterThan(40);
  });

  it("pauses active age while the review is waiting on the user", () => {
    const sla = calculateReviewSla({
      submittedAt: started,
      targetHours: 48,
      waitingOn: "user",
      waitingSince: "2026-08-11 00:00:00",
      now,
    });

    expect(sla.state).toBe("waiting_user");
    expect(sla.ageHours).toBe(24);
    expect(sla.remainingHours).toBe(24);
  });

  it("carries stored pause time after AKARI resumes the review", () => {
    const sla = calculateReviewSla({
      submittedAt: started,
      targetHours: 48,
      waitingOn: "akari",
      pausedSeconds: 24 * 60 * 60,
      now,
    });

    expect(sla.state).toBe("due_soon");
    expect(sla.ageHours).toBe(24);
    expect(sla.remainingHours).toBe(24);
  });
});
