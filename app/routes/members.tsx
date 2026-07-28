import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/members";
import { PublicFooter } from "~/components/PublicFooter";
import { ProfileAvatar } from "~/components/ProfileAvatar";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember, requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import type { Role } from "~/lib/domain";
import {
  canAccessDirectoryProfile,
  memberDirectoryFilters,
  memberMatchesDirectoryFilters,
} from "~/lib/member-directory";
import {
  acceptConnectionRequest,
  connectionState,
  sendConnectionRequest,
  type ConnectionState,
} from "~/lib/network.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { isRoleVerifiedId } from "~/lib/role-verification.server";

interface DirectoryMember {
  id: string;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  languagesJson: string;
  expertise: string;
  openTo: string;
  avatarKey: string;
  rolesCsv: string;
  relationship: ConnectionState;
  investorVerified: number;
  visibility: "public" | "members" | "connections" | "private";
}

type DirectoryView = "list" | "grid";

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
  const url = new URL(request.url);
  const filters = memberDirectoryFilters(url);
  const view: DirectoryView =
    url.searchParams.get("view") === "grid" ? "grid" : "list";
  const memberAccess = user.accessTier === "member" ? 1 : 0;

  const rows = await db
    .prepare(
      `SELECT u.id, u.username, p.display_name AS displayName,
              COALESCE(p.headline, '') AS headline,
              COALESCE(p.bio, '') AS bio,
              CASE WHEN COALESCE(pss.show_location, 0) = 1
                THEN COALESCE(p.location, '') ELSE '' END AS location,
              CASE WHEN COALESCE(pss.show_languages, 1) = 1
                THEN COALESCE(pss.languages_json, '[]') ELSE '[]'
                END AS languagesJson,
              COALESCE(p.expertise, '') AS expertise,
              COALESCE(p.open_to, '') AS openTo,
              COALESCE(p.avatar_key, '') AS avatarKey,
              COALESCE(pv.visibility, p.visibility) AS visibility,
              group_concat(DISTINCT ur.role) AS rolesCsv,
              CASE WHEN EXISTS (
                SELECT 1 FROM role_verifications investor_rv
                WHERE investor_rv.user_id = u.id
                  AND investor_rv.role = 'investor'
                  AND investor_rv.status = 'verified'
                  AND (
                    NOT EXISTS (
                      SELECT 1 FROM verification_provenance vp
                      WHERE vp.user_id = u.id AND vp.role = 'investor'
                    )
                    OR EXISTS (
                      SELECT 1 FROM verification_provenance vp
                      WHERE vp.user_id = u.id AND vp.role = 'investor'
                        AND vp.status = 'active'
                        AND (vp.review_due_at IS NULL
                          OR vp.review_due_at > datetime('now'))
                    )
                  )
              ) THEN 1 ELSE 0 END AS investorVerified,
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
       LEFT JOIN profile_share_settings pss ON pss.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN connections c
         ON ((c.requester_id = ? AND c.recipient_id = u.id)
          OR (c.recipient_id = ? AND c.requester_id = u.id))
       WHERE u.status = 'active'
         AND u.id <> ?
         AND COALESCE(c.status, '') <> 'blocked'
         AND (
           COALESCE(pv.visibility, p.visibility) = 'public'
           OR (? = 1 AND COALESCE(pv.visibility, p.visibility) IN ('members', 'connections'))
         )
       GROUP BY u.id
       ORDER BY p.display_name COLLATE NOCASE
       LIMIT 300`,
    )
    .bind(user.id, user.id, user.id, user.id, memberAccess)
    .all<DirectoryMember>();

  const members = rows.results
    .map((member) => {
      const roles = member.rolesCsv.split(",").filter(Boolean) as Role[];
      const profileAccessible = canAccessDirectoryProfile(
        member.visibility,
        user.accessTier,
        member.relationship === "connected",
      );
      const visibleMember = {
        ...member,
        roles,
        profileAccessible,
        headline: profileAccessible ? member.headline : "",
        bio: profileAccessible ? member.bio : "",
        location: profileAccessible ? member.location : "",
        languagesJson: profileAccessible ? member.languagesJson : "[]",
        expertise: profileAccessible ? member.expertise : "",
        openTo: profileAccessible ? member.openTo : "",
        avatarKey: profileAccessible ? member.avatarKey : "",
      };
      return {
        ...visibleMember,
        languages: (() => {
          try {
            const parsed: unknown = JSON.parse(visibleMember.languagesJson);
            return Array.isArray(parsed)
              ? parsed.filter(
                  (language): language is string =>
                    typeof language === "string",
                )
              : [];
          } catch {
            return [];
          }
        })(),
      };
    })
    .filter((member) => memberMatchesDirectoryFilters(member, filters))
    .slice(0, 60);

  return {
    user,
    filters,
    view,
    viewerFounderVerified: user.roles.includes("founder")
      ? await isRoleVerifiedId(db, user.id, "founder")
      : false,
    members,
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
    .prepare(
      "SELECT id, username FROM users WHERE id = ? AND status = 'active'",
    )
    .bind(recipientId)
    .first<{ id: string; username: string }>();
  if (!target) throw new Response("Member not found.", { status: 404 });

  await requireActionRateLimit(db, request, "connections", user.id, 30, 60);
  const relationship = await connectionState(db, user.id, target.id);
  if (relationship === "blocked")
    throw new Response("Member not found.", { status: 404 });

  if (intent === "connect") {
    if (relationship !== "none")
      throw new Response("Connection action is not available.", {
        status: 409,
      });
    await sendConnectionRequest(db, user, recipientId);
  } else if (intent === "accept") {
    if (relationship !== "incoming_pending")
      throw new Response("Connection request not found.", { status: 404 });
    await acceptConnectionRequest(db, user, recipientId);
  } else throw new Response("Unsupported action.", { status: 400 });

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
  const filterParams = new URLSearchParams(
    Object.entries(loaderData.filters).filter(([, value]) => value),
  );
  const directoryUrl = (view: DirectoryView) => {
    const params = new URLSearchParams(filterParams);
    if (view === "grid") params.set("view", "grid");
    const query = params.toString();
    return `/members${query ? `?${query}` : ""}`;
  };
  const currentUrl = directoryUrl(loaderData.view);
  const clearFiltersUrl =
    loaderData.view === "grid" ? "/members?view=grid" : "/members";

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="directory-main member-directory">
        <header className="directory-heading">
          <div>
            <span className="eyebrow">People of the House</span>
            <h1>Find the people your next chapter needs.</h1>
            <p>
              Approved members can discover one another without exposing
              protected profile details. Full profiles and contact details follow
              each member&apos;s privacy settings.
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
          {loaderData.view === "grid" && (
            <input type="hidden" name="view" value="grid" />
          )}
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
              <Link className="quiet-link" to={clearFiltersUrl}>
                Clear filters
              </Link>
            )}
          </div>
        </Form>

        <div className="member-directory-toolbar">
          <div className="member-directory-summary" aria-live="polite">
            <strong>{loaderData.members.length}</strong>{" "}
            {loaderData.members.length === 1 ? "member" : "members"} found
          </div>
          <div className="member-view-toggle" aria-label="Member result layout">
            <Link
              to={directoryUrl("list")}
              aria-pressed={loaderData.view === "list"}
            >
              List
            </Link>
            <Link
              to={directoryUrl("grid")}
              aria-pressed={loaderData.view === "grid"}
            >
              Cards
            </Link>
          </div>
        </div>

        {loaderData.members.length ? (
          <section
            className={`member-card-grid is-${loaderData.view}`}
            aria-label="Members"
          >
            {loaderData.members.map((member) => {
              const status = relationshipLabel(member.relationship);
              const investorConnection = member.roles.includes("investor");
              const connectionBlockReason = !investorConnection
                ? null
                : !loaderData.viewerFounderVerified
                  ? "Verify your Founder role"
                  : member.investorVerified !== 1
                    ? "Investor review pending"
                    : null;
              const canConnect = connectionBlockReason === null;
              return (
                <article className="member-card" key={member.id}>
                  <ProfileAvatar
                    displayName={member.displayName}
                    src={
                      member.avatarKey
                        ? `/media/profile/${encodeURIComponent(member.username)}?v=${encodeURIComponent(member.avatarKey)}`
                        : undefined
                    }
                    variant="card"
                  />
                  <div className="member-card-body">
                    <div className="member-card-identity">
                      <div className="role-pills">
                        {member.roles.map((role) => (
                          <span key={role}>{role}</span>
                        ))}
                      </div>
                      <h2>
                        {member.profileAccessible ? (
                          <Link to={`/profiles/${member.username}`}>
                            {member.displayName}
                          </Link>
                        ) : (
                          member.displayName
                        )}
                      </h2>
                      <p className="member-card-handle">
                        @{member.username}
                        {member.location ? ` · ${member.location}` : ""}
                      </p>
                    </div>
                    <div className="member-card-summary">
                      {member.languages.length > 0 && (
                        <p className="member-card-languages">
                          Languages: {member.languages.join(", ")}
                        </p>
                      )}
                      <p>
                        {member.profileAccessible
                          ? member.headline ||
                            member.bio ||
                            "This member is still shaping their introduction."
                          : "Profile details open after a mutual connection."}
                      </p>
                      {member.expertise && (
                        <p className="member-card-expertise">
                          <strong>Expertise</strong>
                          {member.expertise}
                        </p>
                      )}
                    </div>
                    <footer>
                      {member.profileAccessible ? (
                        <Link
                          className="quiet-link"
                          to={`/profiles/${member.username}`}
                        >
                          View profile
                        </Link>
                      ) : (
                        <span className="status-pill">
                          Connection-gated profile
                        </span>
                      )}
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
                              disabled={!canConnect}
                              title={connectionBlockReason ?? undefined}
                            >
                              {connectionBlockReason ?? "Connect"}
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
                Try a broader role, location or expertise. Members who choose a
                fully private profile remain out of the directory.
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
