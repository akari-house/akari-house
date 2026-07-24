import {
  parseProjectSeeking,
  projectNeedLabel,
} from "~/lib/project-needs";

export function ProjectNeedChips({
  value,
  compact = false,
}: {
  value?: string | null;
  compact?: boolean;
}) {
  const parsed = parseProjectSeeking(value);
  if (!parsed.needs.length && !parsed.other) return null;

  return (
    <div
      className={`project-need-chips${compact ? " is-compact" : ""}`}
      aria-label="Project support needs"
    >
      {parsed.needs.map((need) => (
        <span key={need}>{projectNeedLabel(need)}</span>
      ))}
      {parsed.other && <span className="is-other">{parsed.other}</span>}
    </div>
  );
}
