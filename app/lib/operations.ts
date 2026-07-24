export type OperationsCounts = {
  membershipApplications: number;
  roleVerifications: number;
  projects: number;
  interests: number;
  events: number;
  campaigns: number;
  moderationReports: number;
  contactMessages: number;
};

export type OperationsState = "clear" | "work_waiting" | "attention";

export function totalOutstandingOperations(counts: OperationsCounts) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

export function operationsState(counts: OperationsCounts): OperationsState {
  if (counts.moderationReports > 0 || counts.contactMessages > 0)
    return "attention";
  if (totalOutstandingOperations(counts) > 0) return "work_waiting";
  return "clear";
}

export function operationsStateMessage(state: OperationsState) {
  if (state === "attention")
    return "Trust, safety or member-support work needs attention.";
  if (state === "work_waiting")
    return "Review work is waiting across the House.";
  return "All monitored launch queues are clear.";
}
