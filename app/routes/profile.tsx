import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/profile";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { getVisibleProfile } from "~/lib/profile.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  acceptConnectionRequest,
  connectionState,
  loadVisibleContacts,
  sendConnectionRequest,
} from "~/lib/network.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await getOptionalUser(request, db);
  const profile = await getVisibleProfile(
    db,
    params.username,
    user?.id ?? null,
  );
  if (!profile) throw new Response("Profile not found", { status: 404 });
  const relationship =
    user && user.id !== profile.userId
      ? await connectionState(db, user.id, profile.userId)
      : "none";
  const contacts = await loadVisibleContacts(
    db,
    profile.userId,
    user?.id ?? null,
  );
  return { user, profile, relationship, contacts };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const target = await db
    .prepare("SELECT id FROM users WHERE username = ? AND status = 'active'")
    .bind(params.username)
    .first<{ id: string }>();
  if (!target) throw new Response("Profile not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "connect")
    await sendConnectionRequest(db, user, target.id);
  else if (intent === "accept")
    await acceptConnectionRequest(db, user, target.id);
  else throw new Response("Unsupported action.", { status: 400 });
  throw redirect(`/profiles/${params.username}`);
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.profile.displayName} | AKARI House`
        : "Profile | AKARI House",
    },
  ];
}

export default function Profile({ loaderData }: Route.ComponentProps) {
  const { profile, user } = loaderData;
  return (
    <div className="site-shell">
      <SiteHeader user={user} />
      <main id="main-content" className="public-profile">
        <div className="profile-monogram">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <span className="eyebrow">AKARI member</span>
        <h1>{profile.displayName}</h1>
        {profile.headline && (
          <p className="profile-headline">{profile.headline}</p>
        )}
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
        {(profile.expertise || profile.openTo) && (
          <dl className="profile-details">
            {profile.expertise && (
              <div>
                <dt>Expertise</dt>
                <dd>{profile.expertise}</dd>
              </div>
            )}
            {profile.openTo && (
              <div>
                <dt>Open to</dt>
                <dd>{profile.openTo}</dd>
              </div>
            )}
          </dl>
        )}
        {profile.websiteUrl && (
          <a
            className="profile-website"
            href={profile.websiteUrl}
            rel="noreferrer"
            target="_blank"
          >
            Visit website ↗
          </a>
        )}
        {user && user.id !== profile.userId && (
          <div className="profile-connection-actions">
            {loaderData.relationship === "none" && (
              <Form method="post">
                <button
                  className="button button-primary"
                  name="intent"
                  value="connect"
                >
                  Send connection request
                </button>
              </Form>
            )}
            {loaderData.relationship === "incoming_pending" && (
              <Form method="post">
                <button
                  className="button button-primary"
                  name="intent"
                  value="accept"
                >
                  Accept connection request
                </button>
              </Form>
            )}
            {loaderData.relationship === "outgoing_pending" && (
              <span className="status-pill">Connection request pending</span>
            )}
            {loaderData.relationship === "connected" && (
              <span className="status-pill">Mutual connection</span>
            )}
          </div>
        )}
        {loaderData.contacts.length > 0 && (
          <dl className="profile-contacts">
            {loaderData.contacts.map((contact) => (
              <div key={contact.contactType}>
                <dt>{contact.contactType}</dt>
                <dd>{contact.contactValue}</dd>
              </div>
            ))}
          </dl>
        )}
        {user && user.id !== profile.userId && (
          <Link
            className="quiet-link"
            to={`/report?subjectType=profile&subjectId=${encodeURIComponent(profile.userId)}&returnTo=${encodeURIComponent(`/profiles/${profile.username}`)}`}
          >
            Report profile
          </Link>
        )}
        {user?.id === profile.userId && (
          <Link className="button button-primary" to="/app">
            Edit profile
          </Link>
        )}
      </main>
    </div>
  );
}
