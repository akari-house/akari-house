export const launchGateChecks = [
  ["visitor", "Public routes only; protected areas redirect to login"],
  ["applicant", "Application status only; no member data access"],
  ["founder", "Own projects and permitted campaign records only"],
  ["creator", "Own applications, submissions, disputes and settlement only"],
  ["investor", "Only diligence documents covered by an active grant"],
  ["multi_role", "Union of verified roles without administrative privileges"],
  ["scoped_admin", "Only explicitly granted administration scopes"],
  ["superadmin", "Full administration with audited actions"],
  ["suspended", "Authenticated access denied except account support paths"],
  ["blocked", "Sessions invalidated and all protected access denied"],
  [
    "cross_account",
    "Foreign profile, project, campaign and settlement records denied",
  ],
  ["private_media", "R2 objects require an authorised application route"],
  ["project_ownership", "Only the owning Founder can edit private project data"],
  [
    "diligence_grant",
    "Active Investor diligence grants work and expired grants fail closed",
  ],
  [
    "diligence_revocation",
    "Revoked diligence access ends immediately and creates audit evidence",
  ],
  [
    "campaign_ownership",
    "Campaign workspaces are restricted to selected Creators and moderators",
  ],
  [
    "settlement_ownership",
    "Settlement and dispute records remain restricted to their Creator",
  ],
  ["moderator", "Campaign moderators do not inherit Superadmin privileges"],
  ["session", "Logout destroys the current session"],
  [
    "password_reset",
    "Password reset consumes the token and invalidates every active session",
  ],
  [
    "status_invalidation",
    "Suspension and blocking delete sessions and deny protected access",
  ],
  [
    "request_security",
    "Same-origin, CSRF and rate-limit controls are enforced",
  ],
  [
    "upload_security",
    "Oversized, spoofed and unauthorised uploads create no stored records",
  ],
  [
    "accessibility",
    "Automated accessibility and mobile viewport checks pass",
  ],
  [
    "keyboard_accessibility",
    "Keyboard navigation, focus trapping and focus restoration work",
  ],
  [
    "production_config",
    "Production bindings, configuration and release identity report ready",
  ],
  [
    "production_smoke",
    "Approved production smoke proves fixtures are closed and protected consoles work",
  ],
] as const;

export type LaunchGateKey = (typeof launchGateChecks)[number][0];

export function launchGateStatus(completed: Iterable<string>) {
  const passed = new Set(completed);
  const total = launchGateChecks.length;
  const complete = launchGateChecks.filter(([key]) => passed.has(key)).length;
  return { total, complete, ready: complete === total };
}
