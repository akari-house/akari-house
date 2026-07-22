import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/dashboard";
import { SiteHeader } from "~/components/SiteHeader";
import { RoleSelector } from "~/components/RoleSelector";
import { requireUser } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, selectedRoles, selectedVisibility } from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const profile = await db.prepare(
    "SELECT display_name AS displayName, COALESCE(bio, '') AS bio, COALESCE(location, '') AS location, visibility FROM profiles WHERE user_id = ?",
  ).bind(user.id).first<{ displayName: string; bio: string; location: string; visibility: string }>();
  if (!profile) throw new Response("Profile missing", { status: 500 });
  return { user, profile, saved: new URL(request.url).searchParams.has("saved"), welcome: new URL(request.url).searchParams.has("welcome") };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const formData = await request.formData();
  const displayName = formText(formData.get("displayName")).trim();
  const bio = formText(formData.get("bio")).trim();
  const location = formText(formData.get("location")).trim();
  const visibility = selectedVisibility(formData.get("visibility"));
  const selected = selectedRoles(formData);
  if (displayName.length < 2 || displayName.length > 80 || bio.length > 600 || location.length > 100 || selected.length === 0) {
    return { error: "Check your profile fields and select at least one role." };
  }
  await db.batch([
    db.prepare("UPDATE profiles SET display_name = ?, bio = ?, location = ?, visibility = ?, updated_at = datetime('now') WHERE user_id = ?")
      .bind(displayName, bio, location, visibility, user.id),
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(user.id),
    ...selected.map((role) => db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").bind(user.id, role)),
  ]);
  throw redirect("/app?saved=1");
}

export default function Dashboard({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main className="dashboard-main">
        <aside className="dashboard-nav">
          <span className="eyebrow">Your House</span>
          <Link className="active" to="/app">Profile</Link>
          <span className="disabled-link">Connections <small>Later</small></span>
          <span className="disabled-link">Messages <small>Later</small></span>
          <span className="disabled-link">Opportunities <small>Later</small></span>
        </aside>
        <section className="dashboard-content">
          {loaderData.welcome && <div className="notice">Welcome to AKARI House. Your profile starts private.</div>}
          {loaderData.saved && <div className="notice success">Profile saved.</div>}
          <div className="dashboard-heading">
            <div><span className="eyebrow">Personal profile</span><h1>Shape how you appear.</h1></div>
            <Link className="button button-quiet" to={`/profiles/${loaderData.user.username}`}>View profile ↗</Link>
          </div>
          <Form method="post" className="profile-form">
            {actionData?.error && <p className="form-error">{actionData.error}</p>}
            <div className="form-row">
              <label>Display name<input name="displayName" defaultValue={loaderData.profile.displayName} required /></label>
              <label>Location<input name="location" defaultValue={loaderData.profile.location} placeholder="Berlin, Germany" /></label>
            </div>
            <label>Biography<textarea name="bio" rows={5} maxLength={600} defaultValue={loaderData.profile.bio} placeholder="What should trusted members know about you?" /></label>
            <RoleSelector selected={loaderData.user.roles} />
            <fieldset className="visibility-fieldset">
              <legend>Who can see your profile?</legend>
              {[
                ["public", "Public", "Visible to anyone"],
                ["members", "AKARI members", "Signed-in approved members"],
                ["connections", "Connections", "Only accepted connections"],
                ["private", "Private", "Only you"],
              ].map(([value, label, description]) => (
                <label key={value}><input type="radio" name="visibility" value={value} defaultChecked={loaderData.profile.visibility === value} /><span><strong>{label}</strong><small>{description}</small></span></label>
              ))}
            </fieldset>
            <button className="button button-primary" disabled={navigation.state !== "idle"} type="submit">Save profile</button>
          </Form>
        </section>
      </main>
    </div>
  );
}
