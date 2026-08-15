export const projectRelationshipTypes = [
  "founder",
  "cofounder",
  "team_member",
  "advisor",
  "authorized_representative",
] as const;

export const claimableProjectRelationshipTypes = [
  "founder",
  "cofounder",
  "team_member",
  "authorized_representative",
] as const;

export type ProjectRelationshipType = (typeof projectRelationshipTypes)[number];
export type ProjectClaimStatus =
  "self_declared" | "pending" | "verified" | "disputed" | "revoked";

export function isClaimableProjectRelationshipType(
  value: string,
): value is (typeof claimableProjectRelationshipTypes)[number] {
  return claimableProjectRelationshipTypes.includes(
    value as (typeof claimableProjectRelationshipTypes)[number],
  );
}

export function projectRelationshipLabel(value: string) {
  const labels: Record<string, string> = {
    founder: "Founder",
    cofounder: "Co-Founder",
    team_member: "Team member",
    advisor: "Advisor",
    authorized_representative: "Authorized representative",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function projectClaimStatusLabel(value: string) {
  const labels: Record<string, string> = {
    self_declared: "Self-declared",
    pending: "Verification pending",
    verified: "Verified",
    disputed: "Disputed",
    revoked: "Revoked",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function projectSlugFromReference(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "projects" || !parts[1]) return null;
    candidate = parts[1];
  } catch {
    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length > 1) {
      if (parts[0] !== "projects" || !parts[1]) return null;
      candidate = parts[1];
    }
  }

  const slug = candidate.toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}
