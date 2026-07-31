import {
  projectNeedPublicLabel,
  projectNeedStatus,
} from "~/lib/project-need-status";
import { parseProjectSeeking, projectNeedLabel } from "~/lib/project-needs";

export function ProjectNeedChips({
  value,
  statusValue,
  compact = false,
  mode = "all",
}: {
  value?: string | null;
  statusValue?: string | null;
  compact?: boolean;
  mode?: "all" | "open" | "closed";
}) {
  const parsed = parseProjectSeeking(value);
  const visibleNeeds = parsed.needs.filter((need) => {
    const open = projectNeedStatus(statusValue, need).status === "open";
    return mode === "all" || (mode === "open" ? open : !open);
  });
  const showOther = parsed.other && mode !== "closed";
  if (!visibleNeeds.length && !showOther) return null;

  return (
    <div
      className={`project-need-chips${compact ? " is-compact" : ""}`}
      aria-label={
        mode === "closed" ? "Project support progress" : "Project support needs"
      }
    >
      {visibleNeeds.map((need) => {
        const record = projectNeedStatus(statusValue, need);
        return (
          <span
            className={
              record.status === "open" ? undefined : `is-${record.status}`
            }
            key={need}
            title={record.note || undefined}
          >
            {record.status === "open"
              ? projectNeedLabel(need)
              : projectNeedPublicLabel(need, record)}
            {record.status !== "open" && <small>Founder-reported</small>}
          </span>
        );
      })}
      {showOther && <span className="is-other">{parsed.other}</span>}
    </div>
  );
}
