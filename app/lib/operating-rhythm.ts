export const attentionSeverities = [
  "overdue",
  "today",
  "soon",
  "watch",
] as const;
export type AttentionSeverity = (typeof attentionSeverities)[number];

export const attentionSourceTypes = [
  "relationship",
  "agreement",
  "diligence",
  "introduction",
  "settlement",
  "dispute",
  "campaign_closeout",
  "campaign_renewal",
  "review_sla",
  "fundraising",
] as const;
export type AttentionSourceType = (typeof attentionSourceTypes)[number];

export const attentionStatuses = [
  "open",
  "snoozed",
  "resolved",
  "ignored",
] as const;
export type AttentionStatus = (typeof attentionStatuses)[number];

export const operatingReportTypes = [
  "management_weekly",
  "founder_weekly",
  "fundraising_pipeline",
  "campaign_portfolio",
  "relationship_followup",
] as const;
export type OperatingReportType = (typeof operatingReportTypes)[number];

export const attentionSourceLabels: Record<AttentionSourceType, string> = {
  relationship: "Relationship",
  agreement: "Agreement",
  diligence: "Diligence",
  introduction: "Investor introduction",
  settlement: "Campaign settlement",
  dispute: "Campaign dispute",
  campaign_closeout: "Campaign closeout",
  campaign_renewal: "Campaign renewal",
  review_sla: "Review SLA",
  fundraising: "Fundraising",
};

export const operatingReportLabels: Record<OperatingReportType, string> = {
  management_weekly: "Management weekly",
  founder_weekly: "Founder weekly",
  fundraising_pipeline: "Fundraising pipeline",
  campaign_portfolio: "Campaign portfolio",
  relationship_followup: "Relationship follow-up",
};

export type AttentionSignal = {
  attentionKey: string;
  sourceType: AttentionSourceType;
  sourceId: string;
  signalType: string;
  title: string;
  detail: string;
  actionUrl: string;
  dueAt: string | null;
  ownerUserId: string | null;
  projectId: string | null;
  severity: AttentionSeverity;
};

export type AttentionState = {
  attentionKey: string;
  status: AttentionStatus;
  assignedTo: string | null;
  snoozedUntil: string | null;
  note: string;
};

export type ActiveAttentionSignal = AttentionSignal & {
  assignedTo: string | null;
  stateStatus: AttentionStatus;
  stateNote: string;
};

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function classifyDueDate(
  dueAt: string | null,
  now = new Date(),
  soonDays = 7,
): AttentionSeverity {
  const due = validDate(dueAt);
  if (!due) return "watch";
  const nowUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dueUtcDay = Date.UTC(
    due.getUTCFullYear(),
    due.getUTCMonth(),
    due.getUTCDate(),
  );
  const days = Math.round((dueUtcDay - nowUtcDay) / 86_400_000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= soonDays) return "soon";
  return "watch";
}

export function attentionKey(
  sourceType: AttentionSourceType,
  sourceId: string,
  signalType: string,
) {
  return `${sourceType}:${sourceId}:${signalType}`;
}

export function isAttentionStatus(value: string): value is AttentionStatus {
  return attentionStatuses.includes(value as AttentionStatus);
}

export function isOperatingReportType(
  value: string,
): value is OperatingReportType {
  return operatingReportTypes.includes(value as OperatingReportType);
}

export function applyAttentionStates(
  signals: AttentionSignal[],
  states: AttentionState[],
  now = new Date(),
): ActiveAttentionSignal[] {
  const byKey = new Map(states.map((state) => [state.attentionKey, state]));
  const nowMs = now.getTime();
  return signals
    .filter((signal) => {
      const state = byKey.get(signal.attentionKey);
      if (!state) return true;
      if (state.status === "resolved" || state.status === "ignored")
        return false;
      if (state.status !== "snoozed" || !state.snoozedUntil) return true;
      const snoozedUntil = new Date(state.snoozedUntil).getTime();
      return !Number.isFinite(snoozedUntil) || snoozedUntil <= nowMs;
    })
    .map((signal) => {
      const state = byKey.get(signal.attentionKey);
      return {
        ...signal,
        assignedTo: state?.assignedTo ?? signal.ownerUserId,
        stateStatus: state?.status ?? "open",
        stateNote: state?.note ?? "",
      };
    })
    .sort((a, b) => {
      const rank: Record<AttentionSeverity, number> = {
        overdue: 0,
        today: 1,
        soon: 2,
        watch: 3,
      };
      return (
        rank[a.severity] - rank[b.severity] ||
        (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
        a.title.localeCompare(b.title)
      );
    });
}

export function weeklyPeriod(now = new Date()) {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = date.getUTCDay();
  const distanceFromMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - distanceFromMonday);
  const start = date.toISOString().slice(0, 10);
  const endDate = new Date(date);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

export function summarizeAttention(signals: ActiveAttentionSignal[]) {
  const severity = Object.fromEntries(
    attentionSeverities.map((value) => [value, 0]),
  ) as Record<AttentionSeverity, number>;
  const source = Object.fromEntries(
    attentionSourceTypes.map((value) => [value, 0]),
  ) as Record<AttentionSourceType, number>;
  for (const signal of signals) {
    severity[signal.severity] += 1;
    source[signal.sourceType] += 1;
  }
  return { total: signals.length, severity, source };
}
