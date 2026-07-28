import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/profile";
import { SiteHeader } from "~/components/SiteHeader";
import { ProfileAvatar } from "~/components/ProfileAvatar";
import { getOptionalUser, requireApprovedMember } from "~/lib/auth.server";
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
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { loadSocialAccounts } from "~/lib/social.server";
import type { SocialPlatform } from "~/lib/domain";
import "~/styles/member-directory-repair.css";
import {
  isRoleVerifiedId,
  roleVerificationStates,
} from "~/lib/role-verification.server";

const socialLabels: Record<SocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

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
  const verificationStates = await roleVerificationStates(db, profile.userId);
  const socialAccounts = (await loadSocialAccounts(db, profile.userId)).filter(
    (account) => account.profileUrl,
  );
  const targetInvestorVerified = profile.roles.includes("investor")
    ? verificationStates.some(
        (state) => state.role === "investor" && state.status === "verified",
      )
    : false;
  const viewerFounderVerified =
    user?.roles.includes("founder") === true
      ? await isRoleVerifiedId(db, user.id, "founder")
      : false;
  return {
    user,
    profile,
    relationship,
    contacts,
    socialAccounts,
    verificationStates,
    canRequestConnection:
      !profile.roles.includes("investor") ||
      (viewerFounderVerified && targetInvestorVerified),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  const target = await db
    .prepare("SELECT id FROM users WHERE username = ? AND status = 'active'")
    .bind(params.username)
    .first<{ id: string }>();
  if (!target) throw new Response("Profile not found.", { status: 404 });
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  await requireActionRateLimit(db, request, "connections", user.id, 30, 60);
  if (intent === "connect") await sendConnectionRequest(db, user, target.id);
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
        <ProfileAvatar
          displayName={profile.displayName}
          src={
            profile.avatarKey
              ? `/media/profile/${encodeURIComponent(profile.username)}?v=${encodeURIComponent(profile.avatarKey)}`
              : undefined
          }
          variant="profile"
        />
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
            <span key={role}>
              {role}
              {loaderData.verificationStates.some(
                (state) => state.role === role && state.status === "verified",
              )
                ? " · Verified"
                : " · Not verified"}
            </span>
          ))}
        </div>
        {profile.languages.length > 0 && (
          <p className="profile-languages">
            Languages: {profile.languages.join(", ")}
          </p>
        )}
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
        {loaderData.socialAccounts.length > 0 && (
          <nav className="member-profile-socials" aria-label="Social profiles">
            {loaderData.socialAccounts.map((account) => (
              <a
                href={account.profileUrl}
                key={account.platform}
                rel="noreferrer"
                target="_blank"
              >
                <strong>{socialLabels[account.platform]}</strong>
                {account.followerCount !== null && (
                  <span>
                    {new Intl.NumberFormat("en", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(account.followerCount)}
                  </span>
                )}
              </a>
            ))}
          </nav>
        )}
        {user?.accessTier === "member" && user.id !== profile.userId && (
          <div className="profile-connection-actions">
            {loaderData.relationship === "none" && (
              <Form method="post">
                <button
                  className="button button-primary"
                  name="intent"
                  value="connect"
                  disabled={!loaderData.canRequestConnection}
                >
                  Send connection request
                </button>
              </Form>
            )}
            {loaderData.relationship === "none" &&
              !loaderData.canRequestConnection && (
                <p className="notice">
                  Investor connections require a verified Founder and a verified
                  Investor.
                </p>
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
        {user?.accessTier === "member" && user.id !== profile.userId && (
          <Link
            className="quiet-link"
            to={`/report?subjectType=profile&subjectId=${encodeURIComponent(profile.userId)}&returnTo=${encodeURIComponent(`/profiles/${profile.username}`)}`}
          >
            Report profile
          </Link>
        )}
        {user?.accessTier === "applicant" && user.id !== profile.userId && (
          <p className="notice">
            Connections and reporting open after membership approval.
          </p>
        )}
        {user?.id === profile.userId && (
          <div className="profile-owner-actions">
            <Link className="button button-primary" to="/app">
              Edit profile
            </Link>
            <Link className="button button-secondary" to="/profile-card">
              Create sharing card
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
