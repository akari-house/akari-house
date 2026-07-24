import { describe, expect, it } from "vitest";
import {
  parseProjectSeeking,
  projectHasNeed,
  projectSeekingFromForm,
} from "../app/lib/project-needs";

describe("project support needs", () => {
  it("serializes multiple selected needs into readable project copy", () => {
    const form = new FormData();
    form.append("projectNeed", "fundraising");
    form.append("projectNeed", "creator_kol");
    form.append("seekingOther", "Token economics review");

    const result = projectSeekingFromForm(form);
    expect(result.error).toBeNull();
    expect(result.value).toBe(
      "Fundraising · Creator & KOL campaign · Token economics review",
    );
  });

  it("parses structured needs and preserves the additional note", () => {
    expect(
      parseProjectSeeking(
        "GTM & marketing · Community building · Regional expansion support",
      ),
    ).toEqual({
      needs: ["gtm_marketing", "community"],
      other: "Regional expansion support",
    });
  });

  it("keeps legacy free text visible as another need", () => {
    expect(parseProjectSeeking("Introductions to European partners")).toEqual({
      needs: [],
      other: "Introductions to European partners",
    });
  });

  it("requires at least one selected or written need", () => {
    const result = projectSeekingFromForm(new FormData());
    expect(result.error).toContain("Select at least one");
  });

  it("supports project directory filtering", () => {
    expect(
      projectHasNeed("Fundraising · Strategic partnerships", "partnerships"),
    ).toBe(true);
    expect(
      projectHasNeed("Fundraising · Strategic partnerships", "community"),
    ).toBe(false);
  });
});
