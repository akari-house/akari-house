import { describe, expect, it } from "vitest";
import { rooms } from "~/data/house";

describe("room definitions", () => {
  it("provides one complete destination per account role", () => {
    expect(rooms.map((room) => room.role)).toEqual([
      "founder",
      "creator",
      "investor",
    ]);
    expect(
      rooms.every(
        (room) => room.features.length === 4 && room.action.length > 0,
      ),
    ).toBe(true);
  });
});
