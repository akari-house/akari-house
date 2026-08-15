export type ReviewWaitingOn = "akari" | "user";
export type ReviewSlaState =
  "on_track" | "due_soon" | "overdue" | "waiting_user";

export type ReviewSlaResult = {
  state: ReviewSlaState;
  ageHours: number;
  targetHours: number;
  remainingHours: number;
  dueAt: string;
};

function parseUtc(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateReviewSla({
  submittedAt,
  targetHours,
  waitingOn,
  pausedSeconds = 0,
  waitingSince = null,
  now = Date.now(),
}: {
  submittedAt: string;
  targetHours: number;
  waitingOn: ReviewWaitingOn;
  pausedSeconds?: number;
  waitingSince?: string | null;
  now?: number;
}): ReviewSlaResult {
  const started = parseUtc(submittedAt);
  const safeTarget = Math.max(1, Math.round(targetHours));
  const storedPauseMs = Math.max(0, pausedSeconds) * 1000;
  const currentPauseStarted = waitingOn === "user" ? parseUtc(waitingSince) : 0;
  const currentPauseMs = currentPauseStarted
    ? Math.max(0, now - currentPauseStarted)
    : 0;
  const totalPauseMs = storedPauseMs + currentPauseMs;
  const effectiveAgeMs = started
    ? Math.max(0, now - started - totalPauseMs)
    : 0;
  const ageHours = Math.floor(effectiveAgeMs / 3_600_000);
  const dueMs = started + safeTarget * 3_600_000 + totalPauseMs;
  const remainingHours = started
    ? Math.ceil((dueMs - now) / 3_600_000)
    : safeTarget;
  const dueSoonWindow = Math.max(4, Math.ceil(safeTarget * 0.25));

  let state: ReviewSlaState = "on_track";
  if (waitingOn === "user") state = "waiting_user";
  else if (remainingHours < 0) state = "overdue";
  else if (remainingHours <= dueSoonWindow) state = "due_soon";

  return {
    state,
    ageHours,
    targetHours: safeTarget,
    remainingHours,
    dueAt: new Date(dueMs).toISOString(),
  };
}

export function reviewSlaPriorityBoost(result: ReviewSlaResult) {
  if (result.state === "waiting_user") return -40;
  if (result.state === "overdue")
    return 80 + Math.min(72, Math.abs(result.remainingHours));
  if (result.state === "due_soon") return 40;
  return Math.min(24, Math.floor(result.ageHours / 12));
}
