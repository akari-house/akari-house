import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PROFILE_CARD_LANGUAGES,
  formatProfileReach,
  normaliseProfileCardLanguages,
  parseProfileCardLanguages,
  profileCardInitials,
} from "../../app/lib/profile-card";

const read = (path: string) => readFileSync(path, "utf8");

describe("completed AKARI profile card", () => {
  it("supports ten unique languages and individual removal state", () => {
    const languages = normaliseProfileCardLanguages([
      "English",
      "German",
      "French",
      "Spanish",
      "Arabic",
      "Hindi",
      "Tamil",
      "Urdu",
      "Japanese",
      "Korean",
      "Portuguese",
      "english",
    ]);

    expect(languages).toHaveLength(MAX_PROFILE_CARD_LANGUAGES);
    expect(languages).not.toContain("Portuguese");
    expect(parseProfileCardLanguages(JSON.stringify(languages))).toEqual(
      languages,
    );
  });

  it("creates stable monograms and compact reach values", () => {
    expect(profileCardInitials("Mohamed Muaz")).toBe("MM");
    expect(profileCardInitials("AKARI")).toBe("A");
    expect(formatProfileReach(12500)).toBe("12.5K");
  });

  it("renders the requested profile identity and privacy features", () => {
    const component = read("app/components/ProfileShareCard.tsx");
    const route = read("app/routes/profile-card.tsx");

    expect(component).toContain("profile-card-language-tags");
    expect(component).toContain("Remove ${language}");
    expect(component).toContain("profile-card-avatar");
    expect(component).toContain("profile-card-headline");
    expect(component).toContain("Connected social platforms");
    expect(component).toContain("akarihouse.com/profiles/${model.username}");
    expect(component).toContain('value="landscape"');
    expect(component).toContain('value="portrait"');
    expect(route).toContain(
      "languageCandidates.length > MAX_PROFILE_CARD_LANGUAGES",
    );
  });
});
