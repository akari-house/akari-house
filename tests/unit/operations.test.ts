import { describe, expect, it } from "vitest";
import {
  operationsState,
  operationsStateMessage,
  totalOutstandingOperations,
  type OperationsCounts,
} from "../../app/lib/operations";

const emptyCounts: OperationsCounts = {
  membershipApplications: 0,
  roleVerifications: 0,
  projects: 0,
  interests: 0,
  events: 0,
  campaigns: 0,
  moderationReports: 0,
  contactMessages: 0,
};

describe("launch operations state", () => {
  it("reports clear when every queue is empty", () => {
    expect(totalOutstandingOperations(emptyCounts)).toBe(0);
    expect(operationsState(emptyCounts)).toBe("clear");
    expect(operationsStateMessage("clear")).toContain("clear");
  });

  it("reports work waiting for ordinary review queues", () => {
    const counts = { ...emptyCounts, membershipApplications: 3, projects: 2 };
    expect(totalOutstandingOperations(counts)).toBe(5);
    expect(operationsState(counts)).toBe("work_waiting");
  });

  it("prioritises trust, safety and support queues", () => {
    expect(operationsState({ ...emptyCounts, moderationReports: 1 })).toBe(
      "attention",
    );
    expect(operationsState({ ...emptyCounts, contactMessages: 1 })).toBe(
      "attention",
    );
  });
});
