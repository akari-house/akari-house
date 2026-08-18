import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_PROFILE_CARD_LANGUAGES,
  PROFILE_CARD_PALETTES,
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

  it("offers five AKARI brand glass colors", () => {
    expect(PROFILE_CARD_PALETTES).toEqual([
      "midnight",
      "pearl",
      "sakura",
      "blossom",
      "lantern",
    ]);
  });

  it("renders a compact frosted identity card instead of a full-width dashboard", () => {
    const component = read("app/components/ProfileShareCard.tsx");
    const styles = read("app/styles/profile-card-glass.css");
    const route = read("app/routes/profile-card.tsx");

    expect(component).toContain("profile-card-language-tags");
    expect(component).toContain("Remove ${language}");
    expect(component).toContain("profile-card-avatar");
    expect(component).toContain("profile-card-headline");
    expect(component).toContain("Connected social platforms");
    expect(component).toContain("akarihouse.com/profiles/${model.username}");
    expect(component).toContain("/assets/brand/akari-logo-horizontal.png");
    expect(component).toContain("/assets/brand/akari-flower-mark.png");
    expect(component).toContain(
      'type="hidden" name="orientation" value="landscape"',
    );
    expect(component).toContain("Glass color");
    expect(styles).toContain("aspect-ratio: 85.6 / 53.98");
    expect(styles).toContain("width: min(100%, 680px)");
    expect(styles).not.toContain("width: min(100%, 1120px)");
    expect(styles).toContain("backdrop-filter: blur(24px)");
    expect(styles).toContain("glass-card-gloss");
    expect(route).toContain(
      "languageCandidates.length > MAX_PROFILE_CARD_LANGUAGES",
    );
  });
});
