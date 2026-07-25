import type { LaunchGateKey } from "./launch-gate";

export const launchGateEvidenceSources = [
  "automated_preview",
  "automated_production",
  "manual_production",
] as const;

export type LaunchGateEvidenceSource =
  (typeof launchGateEvidenceSources)[number];

export type LaunchGateEvidenceStatus = "passed" | "failed" | "skipped";

export type LaunchGateEvidenceSummary = {
  checkKey: LaunchGateKey;
  source: LaunchGateEvidenceSource;
  environment: string;
  commitSha: string | null;
  status: LaunchGateEvidenceStatus;
  testedAt: string;
};

export function launchGateEvidenceLabel(source: LaunchGateEvidenceSource) {
  switch (source) {
    case "automated_preview":
      return "Automated preview";
    case "automated_production":
      return "Automated production";
    case "manual_production":
      return "Manually reviewed production";
  }
}

export function launchGateEvidenceState(
  evidence: LaunchGateEvidenceSummary | null,
  currentCommitSha?: string | null,
  now = Date.now(),
) {
  if (!evidence) return "missing" as const;
  if (evidence.status === "failed") return "failed" as const;
  if (evidence.status !== "passed") return "incomplete" as const;
  if (
    currentCommitSha &&
    evidence.commitSha &&
    currentCommitSha !== evidence.commitSha
  )
    return "stale" as const;
  const age = now - new Date(evidence.testedAt).getTime();
  if (age > 14 * 24 * 60 * 60 * 1000) return "stale" as const;
  return evidence.source === "automated_preview"
    ? ("preview_passed" as const)
    : ("production_passed" as const);
}
