import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "~/components/Icon";
import type { Role } from "~/lib/domain";

const roleCopy: Record<Role, string> = {
  founder: "Build ventures and define what support matters now.",
  creator: "Present expertise and find considered collaborations.",
  investor: "Review relevant opportunities with privacy by default.",
};
const roleRoom: Record<Role, string> = {
  founder: "Strategy Room",
  creator: "Creator Studio",
  investor: "Investor Lounge",
};

function RoleEmblem({ role }: { role: Role }) {
  if (role === "founder") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="20" />
        <path d="m12 30 12-14 12 14M16 34v-8h16v8M20 34h8" />
        <circle cx="24" cy="23" r="2" />
      </svg>
    );
  }

  if (role === "creator") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="20" />
        <path d="M14 34c8-2 17-10 21-23 2 10 0 18-6 23-5 4-10 4-15 0Z" />
        <path d="M17 35c7-5 12-10 17-18" />
        <circle cx="36" cy="15" r="1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="20" />
      <path d="M10 32c4-9 9-14 14-14s10 5 14 14M14 34h20" />
      <path d="M17 29c3-4 5-6 7-6s4 2 7 6" />
      <circle cx="24" cy="29" r="2" />
    </svg>
  );
}

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
      className="membership-section chapter-section story-chapter"
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
        <span className="membership-seal-kicker">Your House seals</span>
        <h3>Which rooms should light for you?</h3>
        <p>
          Choose more than one role if it reflects your work. You can change
          them later.
        </p>
        <fieldset>
          <legend className="sr-only">Choose your AKARI roles</legend>
          {(Object.keys(roleCopy) as Role[]).map((role) => (
            <label key={role} className={`role-seal role-seal-${role}`}>
              <input
                type="checkbox"
                checked={selected.includes(role)}
                onChange={() => toggle(role)}
              />
              <span>
                <span className="role-emblem" aria-hidden="true">
                  <RoleEmblem role={role} />
                </span>
                <strong>{role[0].toUpperCase() + role.slice(1)}</strong>
                <em>{roleRoom[role]}</em>
                <small>{roleCopy[role]}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="membership-action">
          <div className="membership-action-primary">
            {selected.length ? (
              <Link className="button button-primary" to={destination}>
                Continue to membership <Icon name="arrow-right" />
              </Link>
            ) : (
              <button className="button button-primary" type="button" disabled>
                Continue to membership
              </button>
            )}
            <small aria-live="polite">
              {selected.length
                ? `${selected.length} role${selected.length > 1 ? "s" : ""} selected`
                : "Choose at least one role"}
            </small>
          </div>
          <p className="membership-review-note">
            <Icon name="sparkle" />
            Every application is reviewed by a person. No follower threshold and
            no public directory by default.
          </p>
        </div>
      </div>
    </section>
  );
}
