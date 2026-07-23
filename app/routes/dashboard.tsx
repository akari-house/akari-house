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
  return {
    user,
    profile,
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
  if (
    displayName.length < 2 ||
    displayName.length > 80 ||
    headline.length > 120 ||
    bio.length > 600 ||
    location.length > 100 ||
    websiteUrl === null ||
    expertise.length > 240 ||
    openTo.length > 240 ||
    selected.length === 0
  ) {
    return { error: "Check your profile fields and select at least one role." };
  }
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
        visibility,
        user.id,
      ),
    db
      .prepare(
        "INSERT INTO profile_visibility (user_id, visibility, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET visibility = excluded.visibility, updated_at = excluded.updated_at",
      )
      .bind(user.id, visibility),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(user.id),
    ...selected.map((role) =>
      db
        .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
        .bind(user.id, role),
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
          <div className="dashboard-heading">
            <div>
              <span className="eyebrow">Personal profile</span>
              <h1>Shape how you appear.</h1>
            </div>
            <Link
              className="button button-quiet"
              to={`/profiles/${loaderData.user.username}`}
            >
              View profile ↗
            </Link>
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
            <fieldset className="visibility-fieldset" id="privacy-controls">
              <legend>Who can see your profile?</legend>
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
