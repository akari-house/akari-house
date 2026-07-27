export interface HouseMemberPreview {
  username: string;
  displayName: string;
  hasAvatar: boolean;
}

export interface HouseRolePresence {
  totalCount: number;
  members: HouseMemberPreview[];
}

export function remainingMemberCount(
  totalCount: number,
  displayedCount: number,
) {
  return Math.max(0, totalCount - displayedCount);
}

function PresenceGroup({
  label,
  role,
  presence,
}: {
  label: string;
  role: "creator" | "investor";
  presence: HouseRolePresence;
}) {
  const remaining = remainingMemberCount(
    presence.totalCount,
    presence.members.length,
  );

  return (
    <article
      className="house-member-presence__group"
      data-role={role}
      aria-label={`${presence.totalCount.toLocaleString()} approved ${label.toLowerCase()} with public profiles`}
    >
      <div className="house-member-presence__meta">
        <span>{label}</span>
        <strong>{presence.totalCount.toLocaleString()}</strong>
      </div>
      <div className="house-member-presence__avatars" aria-hidden="true">
        {presence.members.map((member) =>
          member.hasAvatar ? (
            <img
              key={member.username}
              src={`/media/profile/${member.username}`}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              title={member.displayName}
            />
          ) : (
            <span
              className="house-member-presence__monogram"
              key={member.username}
              title={member.displayName}
            >
              {member.displayName.slice(0, 1).toUpperCase()}
            </span>
          ),
        )}
        {remaining > 0 && (
          <span
            className="house-member-presence__remaining"
            title={`${remaining.toLocaleString()} more ${label.toLowerCase()}`}
          >
            +{remaining.toLocaleString()}
          </span>
        )}
      </div>
    </article>
  );
}

export function HouseMemberPresence({
  creators,
  investors,
}: {
  creators: HouseRolePresence;
  investors: HouseRolePresence;
}) {
  return (
    <section
      className="house-member-presence"
      aria-labelledby="house-member-presence-title"
    >
      <div className="house-member-presence__intro">
        <span>The people inside</span>
        <p id="house-member-presence-title">
          A glimpse of approved members who chose to be publicly visible.
        </p>
      </div>
      <div className="house-member-presence__groups">
        <PresenceGroup label="Creators" role="creator" presence={creators} />
        <PresenceGroup label="Investors" role="investor" presence={investors} />
      </div>
    </section>
  );
}
