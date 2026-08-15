export type AdminScope =
  "membership" | "verification" | "projects" | "campaigns" | "moderation";

export const adminScopes: AdminScope[] = [
  "membership",
  "verification",
  "projects",
  "campaigns",
  "moderation",
];

export type AdminAccessLevel = "admin" | "superadmin";

export interface AdminWorkspaceAccess {
  accessLevel: AdminAccessLevel;
  scopes: AdminScope[];
}

export type AdminWorkspaceItem = {
  key: string;
  label: string;
  description: string;
  to: string;
  scope?: AdminScope;
  superadminOnly?: boolean;
};

export const adminWorkspaceItems: AdminWorkspaceItem[] = [
  {
    key: "membership",
    label: "Membership",
    description: "Review applicants and approve House access.",
    to: "/admin/applications",
    scope: "membership",
  },
  {
    key: "verification",
    label: "Role verification",
    description: "Review Founder, Creator and Investor evidence.",
    to: "/admin/verifications",
    scope: "verification",
  },
  {
    key: "project-claims",
    label: "Project claims",
    description: "Verify Founder and representative relationships to projects.",
    to: "/admin/project-claims",
    scope: "projects",
  },
  {
    key: "moderation",
    label: "Moderation",
    description: "Resolve reports and apply proportionate enforcement.",
    to: "/admin/moderation",
    scope: "moderation",
  },
  {
    key: "projects",
    label: "Projects & interests",
    description: "Review projects, opportunities and member interests.",
    to: "/admin/interests",
    scope: "projects",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    description: "Review campaign submissions and delivery operations.",
    to: "/admin/campaigns",
    scope: "campaigns",
  },
  {
    key: "creator-compensation",
    label: "Creator compensation",
    description:
      "Verify campaign metrics, finalize private allocations, award bonuses and export reports.",
    to: "/admin/campaign-compensation",
    scope: "campaigns",
  },
  {
    key: "contact",
    label: "Contact desk",
    description: "Handle inbound support and trust enquiries.",
    to: "/admin/contact",
    scope: "moderation",
  },
  {
    key: "operations",
    label: "Operations centre",
    description: "Monitor queues, delivery health and scheduled jobs.",
    to: "/admin/operations",
    superadminOnly: true,
  },
  {
    key: "team",
    label: "Admin team",
    description: "Assign scoped administrator permissions.",
    to: "/admin/team",
    superadminOnly: true,
  },
  {
    key: "directory",
    label: "Public people & partners",
    description: "Manage AKARI team, advisors and partner identities.",
    to: "/admin/house-directory",
    superadminOnly: true,
  },
  {
    key: "production",
    label: "Production",
    description: "Review release evidence and production readiness.",
    to: "/admin/production",
    superadminOnly: true,
  },
];

export function canAccessAdminWorkspaceItem(
  access: AdminWorkspaceAccess,
  item: AdminWorkspaceItem,
) {
  if (access.accessLevel === "superadmin") return true;
  if (item.superadminOnly) return false;
  return item.scope ? access.scopes.includes(item.scope) : false;
}

export function visibleAdminWorkspaceItems(access: AdminWorkspaceAccess) {
  return adminWorkspaceItems.filter((item) =>
    canAccessAdminWorkspaceItem(access, item),
  );
}
