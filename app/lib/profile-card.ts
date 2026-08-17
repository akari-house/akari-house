export const MAX_PROFILE_CARD_LANGUAGES = 10;

export const PROFILE_CARD_LANGUAGE_OPTIONS = [
  "Arabic",
  "Bengali",
  "Chinese",
  "Dutch",
  "English",
  "French",
  "German",
  "Greek",
  "Gujarati",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Malay",
  "Marathi",
  "Persian",
  "Polish",
  "Portuguese",
  "Punjabi",
  "Russian",
  "Sinhala",
  "Spanish",
  "Swedish",
  "Tamil",
  "Telugu",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Urdu",
  "Vietnamese",
] as const;

export const PROFILE_CARD_PALETTES = [
  "midnight",
  "pearl",
  "sakura",
  "blossom",
  "lantern",
] as const;
export const PROFILE_CARD_DESIGNS = ["signature", "passport"] as const;
export const PROFILE_CARD_ORIENTATIONS = ["landscape", "portrait"] as const;
export const PROFILE_CARD_SOCIAL_PLATFORMS = [
  "x",
  "linkedin",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
] as const;

export type ProfileCardPalette = (typeof PROFILE_CARD_PALETTES)[number];
export type ProfileCardDesign = (typeof PROFILE_CARD_DESIGNS)[number];
export type ProfileCardOrientation = (typeof PROFILE_CARD_ORIENTATIONS)[number];
export type ProfileCardSocialPlatform =
  (typeof PROFILE_CARD_SOCIAL_PLATFORMS)[number];
export type ProfileCardSignalSource =
  "official_api" | "partner_verified" | "member_reported" | "unavailable";

export type ProfileCardSettings = {
  design: ProfileCardDesign;
  orientation: ProfileCardOrientation;
  palette: ProfileCardPalette;
  countryCode: string;
  showLocation: number;
  languagesJson: string;
  showLanguages: number;
};

export type ProfileCardSocial = {
  platform: ProfileCardSocialPlatform;
  profileUrl: string;
  followerCount: number | null;
  countSource: ProfileCardSignalSource;
};

export type ProfileCardModel = {
  username: string;
  accessTier: string;
  displayName: string;
  headline: string;
  location: string;
  avatarKey: string;
  visibility: string;
  roles: string[];
  socials: ProfileCardSocial[];
  settings: ProfileCardSettings;
  opportunityStats: { created: number; received: number };
  followerCount: number;
  percentile: {
    topPercent: number | null;
    confidence: "verified" | "provisional" | "insufficient";
  };
  verificationStates: Array<{ role: string; status: string }>;
};

export function normaliseProfileCardLanguages(items: readonly string[]) {
  const languages: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const language = item.trim();
    const key = language.toLocaleLowerCase("en");
    if (!language || language.length > 30 || seen.has(key)) continue;
    seen.add(key);
    languages.push(language);
    if (languages.length === MAX_PROFILE_CARD_LANGUAGES) break;
  }

  return languages;
}

export function parseProfileCardLanguages(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? normaliseProfileCardLanguages(
          parsed.filter((item): item is string => typeof item === "string"),
        )
      : [];
  } catch {
    return [];
  }
}

export function profileCardInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "A";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatProfileReach(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}
