import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/members";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import type { Role } from "~/lib/domain";
import { memberDirectoryFilters } from "~/lib/member-directory";
import {
  acceptConnectionRequest,
  sendConnectionRequest,
  type ConnectionState,
} from "~/lib/network.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

interface DirectoryMember {
  id: string;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  expertise: string;
  openTo: string;
  rolesCsv: string;
  relationship: ConnectionState;
}

export const meta: Route.MetaFunction = () => [
  { title: "Members | AKARI House" },
  {
    name: "description",
    content:
      "Discover approved AKARI House founders, creators and investors through privacy-aware member profiles.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const filters = memberDirectoryFilters(new URL(request.url));
  const memberAccess = user.accessTier === "member" ? 1 : 0;
  const pattern = (value: string) =>
    `%${value.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

  const rows = await db
    .prepare(
      `SELECT u.id, u.username, p.display_name AS displayName,
              COALESCE(p.headline, '') AS headline,
              COALESCE(p.bio, '') AS bio,
              COALESCE(p.location, '') AS location,
              COALESCE(p.expertise, '') AS expertise,
              COALESCE(p.open_to, '') AS openTo,
              group_concat(DISTINCT ur.role) AS rolesCsv,
              CASE
                WHEN c.status = 'blocked' THEN 'blocked'
                WHEN c.status = 'accepted' THEN 'connected'
                WHEN c.status = 'pending' AND c.requester_id = ? THEN 'outgoing_pending'
                WHEN c.status = 'pending' THEN 'incoming_pending'
                ELSE 'none'
              END AS relationship
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN profile_visibility pv ON pv.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN connections c
         ON ((c.requester_id = ? AND c.recipient_id = u.id)
          OR (c.recipient_id = ? AND c.requester_id = u.id))
       WHERE u.status = 'active'
         AND u.id <> ?
         AND COALESCE(c.status, '') <> 'blocked'
         AND (
           COALESCE(pv.visibility, p.visibility) = 'public'
           OR (? = 1 AND COALESCE(pv.visibility, p.visibility) = 'members')
           OR (? = 1 AND COALESCE(pv.visibility, p.visibility) = 'connections'
               AND c.status = 'accepted')
         )
         AND (? = '' OR p.display_name LIKE ? ESCAPE '\\'
              OR u.username LIKE ? ESCAPE '\\'
              OR p.headline LIKE ? ESCAPE '\\'
              OR p.bio LIKE ? ESCAPE '\\'
              OR p.expertise LIKE ? ESCAPE '\\')
         AND (? = '' OR p.location LIKE ? ESCAPE '\\')
         AND (? = '' OR p.expertise LIKE ? ESCAPE '\\')
         AND (? = '' OR EXISTS (
           SELECT 1 FROM user_roles role_filter
           WHERE role_filter.user_id = u.id AND role_filter.role = ?
         ))
       GROUP BY u.id
       ORDER BY p.display_name COLLATE NOCASE
       LIMIT 60`,
    )
    .bind(
      user.id,
      user.id,
      user.id,
      user.id,
      memberAccess,
      memberAccess,
      filters.query,
      pattern(filters.query),
      pattern(filters.query),
      pattern(filters.query),
      pattern(filters.query),
      pattern(filters.query),
      filters.location,
      pattern(filters.location),
      filters.expertise,
      pattern(filters.expertise),
      filters.role,
      filters.role,
    )
    .all<DirectoryMember>();

  return {
    user,
    filters,
    members: rows.results.map((member) => ({
      ...member,
      roles: member.rolesCsv.split(",").filter(Boolean) as Role[],
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const form = await request.formData();
  const recipientId = formText(form.get("recipientId"));
  const intent = formText(form.get("intent"));
  const returnTo = formText(form.get("returnTo"));

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(recipientId)
    .first<{ id: string }>();
  if (!target) throw new Response("Member not found.", { status: 404 });

  if (intent === "connect") await sendConnectionRequest(db, user, recipientId);
  else if (intent === "accept")
    await acceptConnectionRequest(db, user, recipientId);
  else throw new Response("Unsupported action.", { status: 400 });

  throw redirect(returnTo.startsWith("/members") ? returnTo : "/members");
}

function relationshipLabel(relationship: ConnectionState) {
  if (relationship === "connected") return "Mutual connection";
  if (relationship === "outgoing_pending") return "Request pending";
  if (relationship === "incoming_pending") return "Wants to connect";
  return null;
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const filtering = navigation.state === "loading";
  const currentUrl = `/members${
    new URLSearchParams(
      Object.entries(loaderData.filters).filter(([, value]) => value),
    ).toString()
      ? `?${new URLSearchParams(
          Object.entries(loaderData.filters).filter(([, value]) => value),
        )}`
      : ""
  }`;

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main member-directory">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">People of the House</span>
            <h1>Find the people your next chapter needs.</h1>
            <p>
              Profiles appear according to each member&apos;s privacy settings.
              Contact details remain protected until permission is granted.
            </p>
          </div>
          <Link className="button button-quiet" to="/connections">
            My connections
          </Link>
        </header>

        {loaderData.user.accessTier === "applicant" && (
          <div className="notice" role="note">
            Your membership is awaiting approval. For now, this directory shows
            only members who chose a public profile.
          </div>
        )}

        <Form
          className="member-directory-filters"
          method="get"
          role="search"
          aria-label="Find AKARI members"
        >
          <label>
            <span>Search</span>
            <input
              type="search"
              name="q"
              defaultValue={loaderData.filters.query}
              placeholder="Name, headline or expertise"
            />
          </label>
          <label>
            <span>Role</span>
            <select name="role" defaultValue={loaderData.filters.role}>
              <option value="">All roles</option>
              <option value="founder">Founder</option>
              <option value="creator">Creator</option>
              <option value="investor">Investor</option>
            </select>
          </label>
          <label>
            <span>Location</span>
            <input
              name="location"
              defaultValue={loaderData.filters.location}
              placeholder="City or country"
            />
          </label>
          <label>
            <span>Expertise</span>
            <input
              name="expertise"
              defaultValue={loaderData.filters.expertise}
              placeholder="Industry or skill"
            />
          </label>
          <div className="member-directory-filter-actions">
            <button className="button button-primary" type="submit">
              {filtering ? "Searching..." : "Find members"}
            </button>
            {Object.values(loaderData.filters).some(Boolean) && (
              <Link className="quiet-link" to="/members">
                Clear filters
              </Link>
            )}
          </div>
        </Form>

        <div className="member-directory-summary" aria-live="polite">
          <strong>{loaderData.members.length}</strong>{" "}
          {loaderData.members.length === 1 ? "member" : "members"} found
        </div>

        {loaderData.members.length ? (
          <section className="member-card-grid" aria-label="Members">
            {loaderData.members.map((member) => {
              const status = relationshipLabel(member.relationship);
              return (
                <article className="member-card" key={member.id}>
                  <div className="member-card-monogram" aria-hidden="true">
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="member-card-body">
                    <div className="role-pills">
                      {member.roles.map((role) => (
                        <span key={role}>{role}</span>
                      ))}
                    </div>
                    <h2>
                      <Link to={`/profiles/${member.username}`}>
                        {member.displayName}
                      </Link>
                    </h2>
                    <p className="member-card-handle">
                      @{member.username}
                      {member.location ? ` · ${member.location}` : ""}
                    </p>
                    <p>
                      {member.headline ||
                        member.bio ||
                        "This member is still shaping their introduction."}
                    </p>
                    {member.expertise && (
                      <p className="member-card-expertise">
                        <strong>Expertise</strong>
                        {member.expertise}
                      </p>
                    )}
                    <footer>
                      <Link
                        className="quiet-link"
                        to={`/profiles/${member.username}`}
                      >
                        View profile
                      </Link>
                      {status && <span className="status-pill">{status}</span>}
                      {loaderData.user.accessTier === "member" &&
                        member.relationship === "none" && (
                          <Form method="post">
                            <input
                              type="hidden"
                              name="recipientId"
                              value={member.id}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={currentUrl}
                            />
                            <button
                              className="button button-small button-primary"
                              name="intent"
                              value="connect"
                            >
                              Connect
                            </button>
                          </Form>
                        )}
                      {loaderData.user.accessTier === "member" &&
                        member.relationship === "incoming_pending" && (
                          <Form method="post">
                            <input
                              type="hidden"
                              name="recipientId"
                              value={member.id}
                            />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={currentUrl}
                            />
                            <button
                              className="button button-small button-primary"
                              name="intent"
                              value="accept"
                            >
                              Accept request
                            </button>
                          </Form>
                        )}
                    </footer>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="directory-empty" aria-labelledby="members-empty">
            <div className="empty-lantern" aria-hidden="true">
              <span />
            </div>
            <div>
              <span className="eyebrow">A quieter corridor</span>
              <h2 id="members-empty">No members match this search yet.</h2>
              <p>
                Try a broader role, location or expertise. Private profiles stay
                out of view until their owner changes their visibility.
              </p>
              <Link className="button button-quiet" to="/members">
                See all eligible members
              </Link>
            </div>
          </section>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
