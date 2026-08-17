export const relationshipTypes = [
  "founder",
  "investor",
  "creator",
  "partner",
  "client",
  "other",
] as const;

export type RelationshipType = (typeof relationshipTypes)[number];

export const relationshipTypeLabels: Record<RelationshipType, string> = {
  founder: "Founder",
  investor: "Investor",
  creator: "Creator",
  partner: "Partner",
  client: "Client",
  other: "Other",
};

export const relationshipStrengths = [
  "cold",
  "known",
  "warm",
  "strong",
  "trusted",
] as const;

export type RelationshipStrength = (typeof relationshipStrengths)[number];

export const relationshipStrengthLabels: Record<RelationshipStrength, string> = {
  cold: "Cold",
  known: "Known",
  warm: "Warm",
  strong: "Strong",
  trusted: "Trusted",
};

export const relationshipStatuses = ["active", "dormant", "paused", "closed"] as const;
export type RelationshipStatus = (typeof relationshipStatuses)[number];

export const consentStatuses = ["unknown", "granted", "limited", "opted_out"] as const;
export type ConsentStatus = (typeof consentStatuses)[number];

export const interactionTypes = [
  "note",
  "email",
  "telegram",
  "call",
  "meeting",
  "space",
  "introduction",
  "campaign",
  "fundraising",
  "agreement",
  "other",
] as const;
export type InteractionType = (typeof interactionTypes)[number];

export function isRelationshipType(value: string): value is RelationshipType {
  return relationshipTypes.includes(value as RelationshipType);
}

export function isRelationshipStrength(value: string): value is RelationshipStrength {
  return relationshipStrengths.includes(value as RelationshipStrength);
}

export function isRelationshipStatus(value: string): value is RelationshipStatus {
  return relationshipStatuses.includes(value as RelationshipStatus);
}

export function isConsentStatus(value: string): value is ConsentStatus {
  return consentStatuses.includes(value as ConsentStatus);
}

export function isInteractionType(value: string): value is InteractionType {
  return interactionTypes.includes(value as InteractionType);
}

export function relationshipStrengthRank(strength: RelationshipStrength) {
  return relationshipStrengths.indexOf(strength);
}

export function relationshipNeedsAttention(input: {
  status: RelationshipStatus;
  consentStatus: ConsentStatus;
  nextActionAt: string | null;
  lastInteractionAt: string | null;
  now?: Date;
  staleAfterDays?: number;
}) {
  if (input.status === "closed" || input.status === "paused") return false;
  if (input.consentStatus === "opted_out") return false;

  const now = input.now ?? new Date();
  if (input.nextActionAt) {
    const nextAction = new Date(input.nextActionAt);
    if (Number.isFinite(nextAction.getTime()) && nextAction <= now) return true;
  }

  if (!input.lastInteractionAt) return true;
  const lastInteraction = new Date(input.lastInteractionAt);
  if (!Number.isFinite(lastInteraction.getTime())) return true;
  const staleAfterDays = input.staleAfterDays ?? 30;
  const ageMs = now.getTime() - lastInteraction.getTime();
  return ageMs >= staleAfterDays * 24 * 60 * 60 * 1000;
}

export function relationshipDisplayName(input: {
  memberName?: string | null;
  displayName?: string | null;
  email?: string | null;
}) {
  return (
    input.memberName?.trim() ||
    input.displayName?.trim() ||
    input.email?.trim() ||
    "Unnamed relationship"
  );
}

export type WarmPathCandidate = {
  userId: string;
  displayName: string;
  username: string;
  isOwner: boolean;
};

export function prioritizeWarmPaths(candidates: WarmPathCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
