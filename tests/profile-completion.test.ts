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
  it("reports the missing professional introduction fields", () => {
    const result = profileCompletion(emptyProfile);
    expect(result.percent).toBe(17);
    expect(result.missing).toContain("professional headline");
    expect(result.missing).not.toContain("location");
  });

  it("does not penalize members who choose to leave location blank", () => {
    const profile = {
      ...emptyProfile,
      headline: "Founder building useful infrastructure",
      bio: "Building products with the AKARI network.",
      websiteUrl: "https://example.com",
      expertise: "GTM and product",
      openTo: "Collaborations",
    };
    expect(profileCompletion(profile)).toEqual({ percent: 100, missing: [] });
  });

  it("recognizes a complete professional profile", () => {
    const complete = Object.fromEntries(
      Object.keys(emptyProfile).map((key) => [key, "Present"]),
    ) as typeof emptyProfile;
    expect(profileCompletion(complete)).toEqual({ percent: 100, missing: [] });
  });
});
