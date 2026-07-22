import { useState } from "react";
import { Link } from "react-router";
import type { Role } from "~/lib/domain";

const roleCopy: Record<Role, string> = {
  founder: "Build ventures and define what support matters now.",
  creator: "Present expertise and find considered collaborations.",
  investor: "Review relevant opportunities with privacy by default.",
};

export function MembershipDesk() {
  const [selected, setSelected] = useState<Role[]>([]);
  const toggle = (role: Role) =>
    setSelected((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  const destination = selected.length
    ? `/register?${selected.map((role) => `role=${role}`).join("&")}`
    : "/register";

  return (
    <section
      className="membership-section chapter-section"
      id="membership"
      aria-labelledby="membership-title"
    >
      <div className="membership-copy">
        <span className="chapter">Chapter 06 · Membership Desk</span>
        <h2 id="membership-title">
          One identity.
          <br />
          Every role that represents you.
        </h2>
        <p>
          Choose any combination. Your workspaces and profile adapt to how you
          participate.
        </p>
      </div>
      <div className="membership-desk">
        <h3>How will you participate?</h3>
        <p>Select all that apply. You can update your roles later.</p>
        <fieldset>
          <legend className="sr-only">Choose your AKARI roles</legend>
          {(Object.keys(roleCopy) as Role[]).map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={selected.includes(role)}
                onChange={() => toggle(role)}
              />
              <span>
                <strong>{role[0].toUpperCase() + role.slice(1)}</strong>
                <small>{roleCopy[role]}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="membership-action">
          <Link
            className={`button button-primary${selected.length ? "" : " is-disabled"}`}
            aria-disabled={!selected.length}
            tabIndex={selected.length ? 0 : -1}
            to={destination}
          >
            Continue to membership <span aria-hidden="true">→</span>
          </Link>
          <small aria-live="polite">
            {selected.length
              ? `${selected.length} role${selected.length > 1 ? "s" : ""} selected`
              : "Choose at least one role"}
          </small>
        </div>
      </div>
    </section>
  );
}
