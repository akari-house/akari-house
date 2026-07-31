import {
  parseProjectSeeking,
  projectNeedLabel,
  type ProjectNeed,
} from "~/lib/project-needs";

export type ProjectNeedState = "open" | "completed" | "paused" | "closed";
export type FundraisingSource = "akari" | "external" | "mixed" | "undisclosed";

export type ProjectNeedStatusRecord = {
  status: ProjectNeedState;
  source?: FundraisingSource;
  note?: string;
  updatedAt?: string;
};

export type ProjectNeedStatusMap = Partial<
  Record<ProjectNeed, ProjectNeedStatusRecord>
>;

type ProjectNeedStatusFormResult =
  | { error: string }
  | {
      error: null;
      need: ProjectNeed;
      status: ProjectNeedState;
      source: FundraisingSource | undefined;
      note: string;
    };

const validStates = new Set<ProjectNeedState>([
  "open",
  "completed",
  "paused",
  "closed",
]);
const validSources = new Set<FundraisingSource>([
  "akari",
  "external",
  "mixed",
  "undisclosed",
]);

export function parseProjectNeedStatuses(
  raw: string | null | undefined,
): ProjectNeedStatusMap {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const result: ProjectNeedStatusMap = {};
    for (const [need, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as {
        status?: unknown;
        source?: unknown;
        note?: unknown;
        updatedAt?: unknown;
      };
      if (
        typeof candidate.status !== "string" ||
        !validStates.has(candidate.status as ProjectNeedState)
      )
        continue;
      const record: ProjectNeedStatusRecord = {
        status: candidate.status as ProjectNeedState,
      };
      if (
        typeof candidate.source === "string" &&
        validSources.has(candidate.source as FundraisingSource)
      )
        record.source = candidate.source as FundraisingSource;
      if (typeof candidate.note === "string" && candidate.note.trim())
        record.note = candidate.note.trim().slice(0, 180);
      if (typeof candidate.updatedAt === "string")
        record.updatedAt = candidate.updatedAt;
      result[need as ProjectNeed] = record;
    }
    return result;
  } catch {
    return {};
  }
}

export function projectNeedStatus(
  raw: string | null | undefined,
  need: ProjectNeed,
): ProjectNeedStatusRecord {
  return parseProjectNeedStatuses(raw)[need] ?? { status: "open" };
}

export function projectNeedIsOpen(
  raw: string | null | undefined,
  need: ProjectNeed,
) {
  return projectNeedStatus(raw, need).status === "open";
}

export function projectHasOpenNeed(
  seeking: string | null | undefined,
  statusRaw: string | null | undefined,
  need: ProjectNeed,
) {
  return (
    parseProjectSeeking(seeking).needs.includes(need) &&
    projectNeedIsOpen(statusRaw, need)
  );
}

export function projectHasAnyOpenNeed(
  seeking: string | null | undefined,
  statusRaw: string | null | undefined,
) {
  const parsed = parseProjectSeeking(seeking);
  return (
    parsed.other.length > 0 ||
    parsed.needs.some((need) => projectNeedIsOpen(statusRaw, need))
  );
}

export function projectHasAnyClosedNeed(
  seeking: string | null | undefined,
  statusRaw: string | null | undefined,
) {
  return parseProjectSeeking(seeking).needs.some(
    (need) => !projectNeedIsOpen(statusRaw, need),
  );
}

export function fundraisingSourceLabel(source?: FundraisingSource) {
  switch (source) {
    case "akari":
      return "AKARI network";
    case "external":
      return "External investors";
    case "mixed":
      return "AKARI and external investors";
    default:
      return "Source not disclosed";
  }
}

export function projectNeedPublicLabel(
  need: ProjectNeed,
  record: ProjectNeedStatusRecord,
) {
  if (record.status === "open") return projectNeedLabel(need);
  if (need === "fundraising") {
    if (record.status === "completed")
      return `Round completed · ${fundraisingSourceLabel(record.source)}`;
    if (record.status === "paused") return "Fundraising paused";
    return "No longer raising";
  }
  if (record.status === "completed")
    return `${projectNeedLabel(need)} completed`;
  if (record.status === "paused") return `${projectNeedLabel(need)} paused`;
  return `${projectNeedLabel(need)} closed`;
}

export function updateProjectNeedStatus(
  raw: string | null | undefined,
  need: ProjectNeed,
  status: ProjectNeedState,
  source: FundraisingSource | undefined,
  note: string,
  updatedAt: string,
) {
  const statuses = parseProjectNeedStatuses(raw);
  if (status === "open") delete statuses[need];
  else
    statuses[need] = {
      status,
      ...(need === "fundraising" && status === "completed" && source
        ? { source }
        : {}),
      ...(note ? { note } : {}),
      updatedAt,
    };
  return JSON.stringify(statuses);
}

export function retainSelectedProjectNeedStatuses(
  raw: string | null | undefined,
  needs: ProjectNeed[],
) {
  const statuses = parseProjectNeedStatuses(raw);
  const selected = new Set(needs);
  for (const need of Object.keys(statuses) as ProjectNeed[])
    if (!selected.has(need)) delete statuses[need];
  return JSON.stringify(statuses);
}

export function projectNeedStatusFromForm(
  form: FormData,
  seeking: string | null | undefined,
): ProjectNeedStatusFormResult {
  const selectedNeeds = parseProjectSeeking(seeking).needs;
  const needValue = form.get("projectNeed");
  const statusValue = form.get("needStatus");
  const sourceValue = form.get("fundraisingSource");
  const noteValue = form.get("outcomeNote");
  const need = typeof needValue === "string" ? needValue : "";
  const status = typeof statusValue === "string" ? statusValue : "";
  const source = typeof sourceValue === "string" ? sourceValue : "";
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  if (!selectedNeeds.includes(need as ProjectNeed))
    return { error: "Choose one of this project's selected support needs." };
  if (!validStates.has(status as ProjectNeedState))
    return { error: "Choose a valid support status." };
  if (note.length > 180)
    return { error: "Keep the optional outcome note within 180 characters." };
  if (
    need === "fundraising" &&
    status === "completed" &&
    !validSources.has(source as FundraisingSource)
  )
    return { error: "Choose where the completed fundraising came from." };

  return {
    error: null,
    need: need as ProjectNeed,
    status: status as ProjectNeedState,
    source:
      need === "fundraising" && status === "completed"
        ? (source as FundraisingSource)
        : undefined,
    note,
  };
}
