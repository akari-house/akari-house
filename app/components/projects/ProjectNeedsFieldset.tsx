import {
  parseProjectSeeking,
  projectNeedOptions,
} from "~/lib/project-needs";

export function ProjectNeedsFieldset({
  value,
}: {
  value?: string | null;
}) {
  const parsed = parseProjectSeeking(value);
  const selected = new Set(parsed.needs);

  return (
    <fieldset className="project-needs-fieldset">
      <legend>What are you seeking?</legend>
      <p>
        Select every type of support that would be useful. These needs help
        AKARI route your project to relevant members and opportunities.
      </p>
      <div className="project-needs-grid">
        {projectNeedOptions.map((option) => (
          <label className="project-need-option" key={option.value}>
            <input
              type="checkbox"
              name="projectNeed"
              value={option.value}
              defaultChecked={selected.has(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
          </label>
        ))}
      </div>
      <label className="project-needs-other">
        Another need
        <input
          name="seekingOther"
          defaultValue={parsed.other}
          maxLength={100}
          placeholder="Describe another specific type of support."
        />
      </label>
    </fieldset>
  );
}
