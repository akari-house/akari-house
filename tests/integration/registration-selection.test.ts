import { describe, expect, it } from "vitest";
import { selectedRoles } from "~/lib/validation";

describe("registration role selection", () => {
  it("accepts multiple valid roles and ignores unknown values", () => {
    const data = new FormData();
    data.append("roles", "founder");
    data.append("roles", "creator");
    data.append("roles", "administrator");
    expect(selectedRoles(data)).toEqual(["founder", "creator"]);
  });
});
