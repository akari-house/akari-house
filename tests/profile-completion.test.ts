import { describe, expect, it } from "vitest";
import { profileCompletion } from "~/lib/profile-completion";

const emptyProfile = {
  displayName: "Akari Member",
  headline: "",
  bio: "",
  location: "",
  websiteUrl: "",
  expertise: "",
  openTo: "",
};

describe("profile completion", () => {
  it("reports the missing introduction fields", () => {
    const result = profileCompletion(emptyProfile);
    expect(result.percent).toBe(14);
    expect(result.missing).toContain("professional headline");
  });

  it("recognizes a complete professional profile", () => {
    const complete = Object.fromEntries(
      Object.keys(emptyProfile).map((key) => [key, "Present"]),
    ) as typeof emptyProfile;
    expect(profileCompletion(complete)).toEqual({ percent: 100, missing: [] });
  });
});
