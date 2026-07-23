import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/dashboard";
import { SiteHeader } from "~/components/SiteHeader";
import { RoleSelector } from "~/components/RoleSelector";
import { requireUser } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/security.server";
import {
  formText,
  normalizeWebsite,
  selectedRoles,
  selectedVisibility,
} from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { CommonTable } from "~/components/common-table/CommonTable";
import { profileCompletion } from "~/lib/profile-completion";
import {
  interestTypes,
  socialPlatforms,
  type InterestType,
  type SocialPlatform,
} from "~/lib/domain";
import { membershipStatusForUser } from "~/lib/membership.server";
import { loadSocialAccounts } from "~/lib/social.server";

const socialLabels: Record<SocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

const interestLabels: Record<InterestType, string> = {
  ambassador: "Become an AKARI ambassador",
  founder_projects: "Founder projects",
  creator_projects: "Creator collaborations",
  investor_projects: "Investor opportunities",
  event_host: "Request future event-host access",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const profile = await db
    .prepare(
      `SELECT p.display_name AS displayName, COALESCE(p.headline, '') AS headline,
            COALESCE(p.bio, '') AS bio, COALESCE(p.location, '') AS location,
            COALESCE(p.website_url, '') AS websiteUrl,
            COALESCE(p.expertise, '') AS expertise, COALESCE(p.open_to, '') AS openTo,
            COALESCE(v.visibility, p.visibility) AS visibility
     FROM profiles p LEFT JOIN profile_visibility v ON v.user_id = p.user_id
     WHERE p.user_id = ?`,
    )
    .bind(user.id)
    .first<{
      displayName: string;
      headline: string;
      bio: string;
      location: string;
      websiteUrl: string;
      expertise: string;
      openTo: string;
      visibility: string;
    }>();
  if (!profile) throw new Response("Profile missing", { status: 500 });
  const [membership, socialAccounts, interests] = await Promise.all([
    membershipStatusForUser(db, user.id),
    loadSocialAccounts(db, user.id),
    db
      .prepare(
        "SELECT interest_type AS interestType, status FROM interest_requests WHERE user_id = ?",
      )
      .bind(user.id)
      .all<{ interestType: InterestType; status: string }>(),
  ]);
  return {
    user,
    profile,
    membership,
    socialAccounts,
    interests: interests.results,
    saved: new URL(request.url).searchParams.has("saved"),
    welcome: new URL(request.url).searchParams.has("welcome"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const formData = await request.formData();
  const displayName = formText(formData.get("displayName")).trim();
  const headline = formText(formData.get("headline")).trim();
  const bio = formText(formData.get("bio")).trim();
  const location = formText(formData.get("location")).trim();
  const websiteUrl = normalizeWebsite(formData.get("websiteUrl"));
  const expertise = formText(formData.get("expertise")).trim();
  const openTo = formText(formData.get("openTo")).trim();
  const visibility = selectedVisibility(formData.get("visibility"));
  const selected = selectedRoles(formData);
  const socialAccounts = socialPlatforms.map((platform) => {
    const profileUrl = normalizeWebsite(formData.get(`social_${platform}`));
    const rawCount = formText(formData.get(`followers_${platform}`)).trim();
    const followerCount = rawCount === "" ? null : Number(rawCount);
    return { platform, profileUrl, followerCount };
  });
  const selectedInterests = formData
    .getAll("interests")
    .filter((value): value is InterestType =>
      interestTypes.includes(value as InterestType),
    );
  const interestNote = formText(formData.get("interestNote")).trim();
  if (
    displayName.length < 2 ||
    displayName.length > 80 ||
    headline.length > 120 ||
    bio.length > 600 ||
    location.length > 100 ||
    websiteUrl === null ||
    expertise.length > 240 ||
    openTo.length > 240 ||
    selected.length === 0 ||
    socialAccounts.some(
      ({ profileUrl, followerCount }) =>
        profileUrl === null ||
        (followerCount !== null &&
          (!Number.isSafeInteger(followerCount) ||
            followerCount < 0 ||
            followerCount > 2_000_000_000)),
    ) ||
    interestNote.length > 500
  ) {
    return {
      error:
        "Check your profile, social links, follower counts and selected roles.",
    };
  }
  const enforcedVisibility =
    user.accessTier === "member" ? visibility : "private";
  await db.batch([
    db
      .prepare(
        "UPDATE profiles SET display_name = ?, headline = ?, bio = ?, location = ?, website_url = ?, expertise = ?, open_to = ?, visibility = ?, updated_at = datetime('now') WHERE user_id = ?",
      )
      .bind(
        displayName,
        headline,
        bio,
        location,
        websiteUrl,
        expertise,
        openTo,
        enforcedVisibility,
        user.id,
      ),
    db
      .prepare(
        "INSERT INTO profile_visibility (user_id, visibility, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET visibility = excluded.visibility, updated_at = excluded.updated_at",
      )
      .bind(user.id, enforcedVisibility),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(user.id),
    ...selected.map((role) =>
      db
        .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
        .bind(user.id, role),
    ),
    ...socialAccounts.map(({ platform, profileUrl, followerCount }) =>
      db
        .prepare(
          `INSERT INTO profile_social_accounts
           (user_id, platform, profile_url, follower_count, count_source,
            sync_status, last_reported_at, updated_at)
           VALUES (?, ?, ?, ?, 'member_reported', 'manual',
                   CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END,
                   datetime('now'))
           ON CONFLICT(user_id, platform) DO UPDATE SET
             profile_url = excluded.profile_url,
             follower_count = excluded.follower_count,
             count_source = CASE
               WHEN profile_social_accounts.profile_url = excluded.profile_url
                 AND profile_social_accounts.follower_count IS excluded.follower_count
                 AND profile_social_accounts.count_source = 'official_api'
               THEN 'official_api' ELSE 'member_reported' END,
             sync_status = CASE
               WHEN profile_social_accounts.profile_url = excluded.profile_url
                 AND profile_social_accounts.follower_count IS excluded.follower_count
                 AND profile_social_accounts.count_source = 'official_api'
               THEN 'synced' ELSE 'manual' END,
             last_reported_at = excluded.last_reported_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          user.id,
          platform,
          profileUrl ?? "",
          followerCount,
          followerCount,
        ),
    ),
    ...interestTypes.map((interestType) =>
      selectedInterests.includes(interestType)
        ? db
            .prepare(
              `INSERT INTO interest_requests
               (id, user_id, interest_type, note, status, updated_at)
               VALUES (?, ?, ?, ?, 'pending', datetime('now'))
               ON CONFLICT(user_id, interest_type) DO UPDATE SET
                 note = excluded.note,
                 status = CASE
                   WHEN interest_requests.status = 'approved' THEN 'approved'
                   ELSE 'pending'
                 END,
                 updated_at = excluded.updated_at`,
            )
            .bind(
              crypto.randomUUID(),
              user.id,
              interestType,
              interestNote,
            )
        : db
            .prepare(
              `UPDATE interest_requests SET status = 'withdrawn',
               updated_at = datetime('now')
               WHERE user_id = ? AND interest_type = ? AND status = 'pending'`,
            )
            .bind(user.id, interestType),
    ),
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id) VALUES (?, ?, 'profile.updated', 'profile', ?)",
      )
      .bind(crypto.randomUUID(), user.id, user.id),
  ]);
  throw redirect("/app?saved=1");
}

export default function Dashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const completion = profileCompletion(loaderData.profile);
  const isMember = loaderData.user.accessTier === "member";
  const activeInterests = new Set(
    loaderData.interests
      .filter((interest) => interest.status !== "withdrawn")
      .map((interest) => interest.interestType),
  );
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="dashboard-main">
        <aside className="dashboard-nav">
          <span className="eyebrow">Your House</span>
          <Link className="active" to="/app">
            Home
          </Link>
          <a href="#profile-editor">Profile</a>
          <a href="#role-workspaces">Membership</a>
          <a href="#privacy-controls">Privacy and security</a>
        </aside>
        <section className="dashboard-content">
          {loaderData.welcome && (
            <div className="notice">
              Welcome to AKARI House. Your profile starts private.
            </div>
          )}
          {loaderData.saved && (
            <div className="notice success">Profile saved.</div>
          )}
          {!isMember && (
            <div className="notice applicant-notice">
              <strong>Your applicant profile is open.</strong> You can keep
              your biography, roles, social links and interests current while
              the Membership Desk reviews your application. Your profile stays
              private, and media uploads and event hosting remain locked until
              approval.
            </div>
          )}
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">Personal profile</span>
              <h1>Shape how you appear.</h1>
            </div>
            {isMember ? (
              <Link
                className="button button-quiet"
                to={`/profiles/${loaderData.user.username}`}
              >
                View profile
              </Link>
            ) : (
              <span className="button button-quiet is-disabled">
                Profile is private
              </span>
            )}
          </div>
          <section
            id="role-workspaces"
            className="profile-completion"
            aria-label="Profile completion"
          >
            <div>
              <span className="chapter">Profile readiness</span>
              <strong>{completion.percent}% complete</strong>
              <p>
                {completion.missing.length
                  ? `Add ${completion.missing.slice(0, 2).join(" and ")} to help trusted members understand you.`
                  : "Your introduction is ready. Keep it current as your work evolves."}
              </p>
            </div>
            <div
              className="completion-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completion.percent}
              aria-label="Profile completion"
            >
              <span style={{ width: `${completion.percent}%` }} />
            </div>
          </section>
          <section
            aria-labelledby="workspace-preview-title"
            className="dashboard-workspace"
          >
            <span className="chapter">Role workspaces</span>
            <h2 id="workspace-preview-title">
              Switch context without splitting your identity.
            </h2>
            <CommonTable compact />
          </section>
          <Form method="post" className="profile-form" id="profile-editor">
            {actionData?.error && (
              <p className="form-error">{actionData.error}</p>
            )}
            <div className="form-row">
              <label>
                Display name
                <input
                  name="displayName"
                  defaultValue={loaderData.profile.displayName}
                  required
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  defaultValue={loaderData.profile.location}
                  placeholder="Berlin, Germany"
                />
              </label>
            </div>
            <label>
              Professional headline
              <input
                name="headline"
                maxLength={120}
                defaultValue={loaderData.profile.headline}
                placeholder="Founder building trusted creator infrastructure"
              />
            </label>
            <label>
              Biography
              <textarea
                name="bio"
                rows={5}
                maxLength={600}
                defaultValue={loaderData.profile.bio}
                placeholder="What should trusted members know about you?"
              />
            </label>
            <div className="form-row">
              <label>
                Expertise
                <textarea
                  name="expertise"
                  rows={3}
                  maxLength={240}
                  defaultValue={loaderData.profile.expertise}
                  placeholder="Community strategy, consumer products, Japan market"
                />
              </label>
              <label>
                Open to
                <textarea
                  name="openTo"
                  rows={3}
                  maxLength={240}
                  defaultValue={loaderData.profile.openTo}
                  placeholder="Collaborations, thoughtful introductions, advisory work"
                />
              </label>
            </div>
            <label>
              Website
              <input
                name="websiteUrl"
                type="url"
                inputMode="url"
                defaultValue={loaderData.profile.websiteUrl}
                placeholder="https://example.com"
              />
              <small>HTTPS links only.</small>
            </label>
            <RoleSelector selected={loaderData.user.roles} />
            <fieldset className="profile-panel" id="social-links">
              <legend>Social presence</legend>
              <p className="field-help">
                Add links and an optional current count. Counts you enter are
                labelled member-reported; supported official syncs replace
                them with a dated verified count.
              </p>
              <div className="social-profile-grid">
                {loaderData.socialAccounts.map((account) => (
                  <div className="social-profile-row" key={account.platform}>
                    <label>
                      {socialLabels[account.platform]} profile
                      <input
                        name={`social_${account.platform}`}
                        type="url"
                        inputMode="url"
                        defaultValue={account.profileUrl}
                        placeholder={`https://${account.platform}.com/...`}
                      />
                    </label>
                    <label>
                      Followers
                      <input
                        name={`followers_${account.platform}`}
                        type="number"
                        min={0}
                        max={2_000_000_000}
                        defaultValue={account.followerCount ?? ""}
                      />
                    </label>
                    <small>
                      {account.countSource === "official_api"
                        ? `Official sync${account.lastSyncedAt ? ` · ${new Date(account.lastSyncedAt).toLocaleDateString()}` : ""}`
                        : "Member-reported"}
                    </small>
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset className="profile-panel" id="interest-requests">
              <legend>What would you like to explore?</legend>
              <p className="field-help">
                Showing interest is not automatic access. The AKARI team
                reviews ambassador, project and event-host requests.
              </p>
              <div className="interest-grid">
                {interestTypes.map((interestType) => (
                  <label key={interestType}>
                    <input
                      type="checkbox"
                      name="interests"
                      value={interestType}
                      defaultChecked={activeInterests.has(interestType)}
                    />
                    <span>{interestLabels[interestType]}</span>
                  </label>
                ))}
              </div>
              <label>
                A short note for the AKARI team
                <textarea
                  name="interestNote"
                  rows={3}
                  maxLength={500}
                  placeholder="Tell us what you would like to contribute or discover."
                />
              </label>
            </fieldset>
            <fieldset className="visibility-fieldset" id="privacy-controls">
              <legend>Who can see your profile?</legend>
              {!isMember && (
                <p className="field-help">
                  Applicant profiles are enforced as private. Visibility
                  choices unlock after membership approval.
                </p>
              )}
              {[
                ["public", "Public", "Visible to anyone"],
                ["members", "AKARI members", "Signed-in approved members"],
                ["connections", "Connections", "Only accepted connections"],
                ["private", "Private", "Only you"],
              ].map(([value, label, description]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="visibility"
                    value={value}
                    defaultChecked={loaderData.profile.visibility === value}
                    disabled={!isMember}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
              type="submit"
            >
              Save profile
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
