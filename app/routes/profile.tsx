import { Link } from "react-router";
import type { Route } from "./+types/profile";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { getVisibleProfile } from "~/lib/profile.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const profile = await getVisibleProfile(
    db,
    params.username,
    user?.id ?? null,
  );
  if (!profile) throw new Response("Profile not found", { status: 404 });
  return { user, profile };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.profile.displayName} — AKARI House`
        : "Profile — AKARI House",
    },
  ];
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile, user } = loaderData;
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main className="public-profile">
        <div className="profile-monogram">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <span className="eyebrow">AKARI member</span>
        <h1>{profile.displayName}</h1>
        <p className="profile-username">
          @{profile.username} · {profile.location || "Location private"}
        </p>
        <div className="role-pills">
          {profile.roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
        <p className="profile-bio">
          {profile.bio || "This member is still shaping their introduction."}
        </p>
        {user?.id === profile.userId && (
          <Link className="button button-primary" to="/app">
            Edit profile
          </Link>
        )}
      </main>
    </div>
  );
}
