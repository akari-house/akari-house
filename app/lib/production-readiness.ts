export const productionCheckDefinitions = [
  {
    key: "email_delivery",
    label: "Registration and transactional email",
    category: "integration",
    expiresAfterDays: 30,
  },
  {
    key: "password_reset",
    label: "Password reset and session invalidation",
    category: "security",
    expiresAfterDays: 30,
  },
  {
    key: "turnstile_domain",
    label: "Turnstile production-domain verification",
    category: "security",
    expiresAfterDays: 30,
  },
  {
    key: "google_oauth_export",
    label: "Google OAuth and reviewed Sheet export",
    category: "integration",
    expiresAfterDays: 30,
  },
  {
    key: "telegram_delivery",
    label: "Telegram webhook and live notification",
    category: "integration",
    expiresAfterDays: 30,
  },
  {
    key: "private_media",
    label: "R2 private upload and authorised retrieval",
    category: "security",
    expiresAfterDays: 30,
  },
  {
    key: "recovery_drill",
    label: "Encrypted D1 backup and isolated recovery drill",
    category: "resilience",
    expiresAfterDays: 30,
  },
  {
    key: "launch_gate_production",
    label: "Reviewed production launch-gate run",
    category: "launch",
    expiresAfterDays: 30,
  },
] as const;

export type ProductionCheckKey =
  (typeof productionCheckDefinitions)[number]["key"];
export type ProductionCheckStatus =
  | "pending"
  | "passed"
  | "failed"
  | "not_applicable";

export type ProductionCheckRecord = {
  checkKey: string;
  status: ProductionCheckStatus;
  reviewedAt: string | null;
  expiresAt: string | null;
};

export type PublicAuditRecord = {
  status: "passed" | "failed";
  completedAt: string;
  commitSha: string | null;
} | null;

export type PilotState = {
  status: "planning" | "active" | "paused" | "completed";
  stage: "internal" | "invited_15" | "invited_25" | "invited_50" | "invited_100";
} | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function validTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function productionCheckIsFresh(
  record: ProductionCheckRecord | null | undefined,
  expiresAfterDays: number,
  now = new Date(),
) {
  if (!record || record.status !== "passed") return false;
  const reviewedAt = validTime(record.reviewedAt);
  if (reviewedAt === null) return false;
  const explicitExpiry = validTime(record.expiresAt);
  const expiry = explicitExpiry ?? reviewedAt + expiresAfterDays * DAY_MS;
  return expiry > now.getTime();
}

export function evaluateProductionReadiness(input: {
  publicAudit: PublicAuditRecord;
  manualChecks: ProductionCheckRecord[];
  criticalFindings: number;
  unresolvedFindings: number;
  pilot: PilotState;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const byKey = new Map(
    input.manualChecks.map((check) => [check.checkKey, check]),
  );
  const manual = productionCheckDefinitions.map((definition) => {
    const record = byKey.get(definition.key) ?? null;
    return {
      ...definition,
      record,
      fresh: productionCheckIsFresh(
        record,
        definition.expiresAfterDays,
        now,
      ),
    };
  });

  const auditTime = validTime(input.publicAudit?.completedAt);
  const publicAuditFresh = Boolean(
    input.publicAudit?.status === "passed" &&
      auditTime !== null &&
      auditTime > now.getTime() - 7 * DAY_MS,
  );
  const manualPassed = manual.filter((check) => check.fresh).length;
  const manualTotal = manual.length;
  const blockers: string[] = [];

  if (!publicAuditFresh) blockers.push("Current public production audit");
  for (const check of manual) {
    if (!check.fresh) blockers.push(check.label);
  }
  if (input.criticalFindings > 0)
    blockers.push(`${input.criticalFindings} critical or high-severity finding(s)`);

  const readyForPilot = blockers.length === 0;
  const pilotCompleted = input.pilot?.status === "completed";
  const readyToExpand =
    readyForPilot &&
    pilotCompleted &&
    input.unresolvedFindings === 0 &&
    input.criticalFindings === 0;

  return {
    publicAuditFresh,
    manual,
    manualPassed,
    manualTotal,
    blockers,
    readyForPilot,
    readyToExpand,
  };
}
