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
  ["session", "Logout, password reset and status changes invalidate sessions"],
  [
    "request_security",
    "Same-origin, CSRF, rate-limit and upload controls enforced",
  ],
  [
    "accessibility",
    "Keyboard navigation and mobile viewport launch checks pass",
  ],
] as const;

export type LaunchGateKey = (typeof launchGateChecks)[number][0];

export function launchGateStatus(completed: Iterable<string>) {
  const passed = new Set(completed);
  const total = launchGateChecks.length;
  const complete = launchGateChecks.filter(([key]) => passed.has(key)).length;
  return { total, complete, ready: complete === total };
}
