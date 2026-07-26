import { Link } from "react-router";
import type { PublicCommunityGroup } from "~/lib/public-community.server";

export function PublicCommunityProof({
  groups,
}: {
  groups: PublicCommunityGroup[];
}) {
  return (
    <section
      className="community-proof chapter-section story-chapter"
      aria-labelledby="community-proof-title"
    >
      <header className="community-proof-heading">
        <div>
          <span className="chapter">The people inside</span>
          <h2 id="community-proof-title">
            Built around people, not anonymous traffic.
          </h2>
        </div>
        <p>
          Public totals include only active, approved and role-verified members
          who chose a public profile. Private identities remain private.
        </p>
      </header>

      <div className="community-proof-grid">
        {groups.map((group) => {
          const overflow = Math.max(group.total - group.members.length, 0);
          return (
            <article className="community-proof-card" key={group.role}>
              <span className="eyebrow">{group.role}</span>
              <strong className="community-proof-total">
                {group.total.toLocaleString("en-GB")}
              </strong>
              <h3>{group.label}</h3>
              {group.members.length > 0 ? (
                <div
                  className="community-avatar-stack"
                  aria-label={`Public ${group.label.toLowerCase()}`}
                >
                  {group.members.map((member) => (
                    <Link
                      to={`/profiles/${member.username}`}
                      className="community-avatar"
                      key={member.username}
                      title={member.displayName}
                      aria-label={member.displayName}
                    >
                      <span aria-hidden="true">
                        {member.displayName.trim().charAt(0).toUpperCase() || "A"}
                      </span>
                      {member.hasAvatar && (
                        <img
                          src={`/media/profile/${member.username}`}
                          alt=""
                          width={64}
                          height={64}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      )}
                    </Link>
                  ))}
                  {overflow > 0 && (
                    <span className="community-avatar-overflow">
                      +{overflow.toLocaleString("en-GB")}
                    </span>
                  )}
                </div>
              ) : (
                <div className="community-proof-empty">
                  <img
                    src="/assets/optimized/akari-mark.webp"
                    alt=""
                    width={64}
                    height={60}
                    loading="lazy"
                  />
                  <span>Public profiles will appear here as members opt in.</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
