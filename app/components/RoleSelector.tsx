import type { Role } from "~/lib/domain";

const roleCopy: Record<Role, string> = {
  founder: "Build projects and find trusted GTM support.",
  creator: "Share expertise and discover considered campaigns.",
  investor: "Explore relevant founders with privacy by default.",
};

export function RoleSelector({
  selected = [],
  errorId,
}: {
  selected?: Role[];
  errorId?: string;
}) {
  return (
    <fieldset
      className="role-grid"
      aria-invalid={Boolean(errorId)}
      aria-describedby={errorId}
    >
      <legend>Select one or more roles</legend>
      {(Object.keys(roleCopy) as Role[]).map((role) => (
        <label className="role-card" key={role}>
          <input
            type="checkbox"
            name="roles"
            value={role}
            defaultChecked={selected.includes(role)}
          />
          <span className="role-glyph" aria-hidden="true">
            {role === "founder" ? "F" : role === "creator" ? "C" : "I"}
          </span>
          <strong>{role[0].toUpperCase() + role.slice(1)}</strong>
          <small>{roleCopy[role]}</small>
        </label>
      ))}
    </fieldset>
  );
}
