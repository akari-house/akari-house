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
