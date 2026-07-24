export const roles = ["founder", "creator", "investor"] as const;
export type Role = (typeof roles)[number];

export const visibilities = [
  "public",
  "members",
  "connections",
  "private",
] as const;
export type Visibility = (typeof visibilities)[number];

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  accessTier: "applicant" | "member";
  roles: Role[];
}

export const socialPlatforms = [
  "x",
  "linkedin",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];

export const interestTypes = [
  "ambassador",
  "founder_projects",
  "creator_projects",
  "investor_projects",
  "event_host",
] as const;
export type InterestType = (typeof interestTypes)[number];

export interface ProfileRecord {
  userId: string;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  websiteUrl: string;
  expertise: string;
  openTo: string;
  avatarKey: string;
  visibility: Visibility;
  roles: Role[];
}
