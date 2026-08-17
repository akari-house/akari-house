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

  it("renders the branded glass profile identity and privacy features", () => {
    const component = read("app/components/ProfileShareCardGlass.tsx");
    const adapter = read("app/components/ProfileShareCard.tsx");
    const styles = read("app/styles/r79-profile-sharing-glass.css");
    const route = read("app/routes/profile-card.tsx");

    expect(adapter).toContain("ProfileShareCardGlass as ProfileShareCard");
    expect(component).toContain("Midnight Glass");
    expect(component).toContain("Sakura Glass");
    expect(component).toContain("Pearl Glass");
    expect(component).toContain("/assets/brand/akari-logo-horizontal.png");
    expect(component).toContain("/assets/brand/akari-flower-mark.png");
    expect(component).toContain("glass-theme-grid");
    expect(component).toContain("glass-card-avatar");
    expect(component).toContain("Connected social platforms");
    expect(component).toContain("akarihouse.com/profiles/${model.username}");
    expect(component).toContain("canvas.width = portrait ? 1000 : 1586");
    expect(component).toContain("canvas.height = portrait ? 1586 : 1000");
    expect(component).toContain('value="landscape"');
    expect(component).toContain('value="portrait"');
    expect(styles).toContain("aspect-ratio: 856 / 540");
    expect(styles).toContain("backdrop-filter: blur");
    expect(route).toContain(
      "languageCandidates.length > MAX_PROFILE_CARD_LANGUAGES",
    );
  });
});
