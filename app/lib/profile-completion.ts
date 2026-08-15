interface CompletionProfile {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  websiteUrl: string;
  expertise: string;
  openTo: string;
}

const fields: Array<[keyof CompletionProfile, string]> = [
  ["displayName", "display name"],
  ["headline", "professional headline"],
  ["bio", "biography"],
  ["websiteUrl", "website"],
  ["expertise", "expertise"],
  ["openTo", "what you are open to"],
];

export function profileCompletion(profile: CompletionProfile) {
  const missing = fields
    .filter(([key]) => !profile[key].trim())
    .map(([, label]) => label);
  const complete = fields.length - missing.length;
  return {
    percent: Math.round((complete / fields.length) * 100),
    missing,
  };
}
