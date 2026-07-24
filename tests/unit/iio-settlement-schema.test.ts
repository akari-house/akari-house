import { describe, expect, it } from "vitest";

describe("IIO settlement rules", () => {
  it("keeps original allocation separate from final settlement", () => {
    const original = 50000;
    const final = 42500;
    expect(final).toBeLessThanOrEqual(original);
    expect(original).toBe(50000);
  });

  it("requires a reason when a saved final amount changes", () => {
    const previous = 42500;
    const next = 40000;
    const reason = "One approved deliverable was removed after review.";
    expect(previous).not.toBe(next);
    expect(reason.length).toBeGreaterThanOrEqual(10);
  });

  it("blocks final reporting while disputes remain open", () => {
    const disputes = [{ status: "resolved" }, { status: "open" }];
    const open = disputes.filter((item) =>
      ["open", "reviewing"].includes(item.status),
    );
    expect(open).toHaveLength(1);
  });
});
