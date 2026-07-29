import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/dashboard";
import { SiteHeader } from "~/components/SiteHeader";
import { ScrollTo } from "~/components/ScrollTo";
import { ProfilePhotoEditor } from "~/components/ProfilePhotoEditor";
import { RoleSelector } from "~/components/RoleSelector";
import { requireUser } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/security.server";
import {
  formText,
  isXProfileUrl,
  normalizeWebsite,
  selectedRoles,
  selectedVisibility,
  validateEmail,
} from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { DashboardRoleActions } from "~/components/DashboardRoleActions";
import { profileCompletion } from "~/lib/profile-completion";
import {
  interestTypes,
  socialPlatforms,
  type InterestType,
  type SocialPlatform,
} from "~/lib/domain";
import { membershipStatusForUser } from "~/lib/membership.server";
import { loadSocialAccounts } from "~/lib/social.server";
import { validateProfilePhoto } from "~/lib/profile-photo.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import {
  markManagedR2ObjectDeleted,
  registerManagedR2Object,
} from "~/lib/r2-lifecycle.server";
import { roleVerificationClaimStatements } from "~/lib/role-verification.server";

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
            COALESCE(p.avatar_key, '') AS avatarKey,
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
      avatarKey: string;
      visibility: string;
    }>();
  if (!profile) throw new Response("Profile missing", { status: 500 });
  const [
    membership,
    socialAccounts,
    interests,
    contacts,
    activity,
    adminAccess,
    shareSettings,
    reputationSignals,
  ] = await Promise.all([
    membershipStatusForUser(db, user.id),
    loadSocialAccounts(db, user.id),
    db
      .prepare(
        "SELECT interest_type AS interestType, status FROM interest_requests WHERE user_id = ?",
      )
      .bind(user.id)
      .all<{ interestType: InterestType; status: string }>(),
    db
      .prepare(
        `SELECT contact_type AS contactType, contact_value AS contactValue,
                visibility
         FROM profile_contacts WHERE user_id = ? ORDER BY contact_type`,
      )
      .bind(user.id)
      .all<{
        contactType: string;
        contactValue: string;
        visibility: string;
      }>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM notifications
            WHERE user_id = ? AND read_at IS NULL) AS unreadNotifications,
          (SELECT COUNT(*) FROM connections
            WHERE (requester_id = ? OR recipient_id = ?)
              AND status = 'accepted') AS connections,
          (SELECT COUNT(*) FROM project_follows
            WHERE user_id = ?) AS followedProjects,
          (SELECT COUNT(*) FROM event_registrations
            WHERE user_id = ? AND status IN ('registered', 'waitlisted'))
            AS upcomingEvents`,
      )
      .bind(user.id, user.id, user.id, user.id, user.id)
      .first<{
        unreadNotifications: number;
        connections: number;
        followedProjects: number;
        upcomingEvents: number;
      }>(),
    db
      .prepare(
        `SELECT au.access_level AS accessLevel,
                  CASE WHEN au.access_level = 'superadmin' OR campaigns.scope IS NOT NULL
                    THEN 1 ELSE 0 END AS canManageCampaigns,
                  CASE WHEN au.access_level = 'superadmin' OR moderation.scope IS NOT NULL
                    THEN 1 ELSE 0 END AS canModerate
           FROM admin_users au
           LEFT JOIN admin_scopes campaigns
             ON campaigns.admin_user_id = au.user_id
                AND campaigns.scope = 'campaigns'
           LEFT JOIN admin_scopes moderation
             ON moderation.admin_user_id = au.user_id
                AND moderation.scope = 'moderation'
           WHERE au.user_id = ?`,
      )
      .bind(user.id)
      .first<{
        accessLevel: string;
        canManageCampaigns: number;
        canModerate: number;
      }>(),
    db
      .prepare(
        `SELECT country_code AS countryCode, show_location AS showLocation,
                languages_json AS languagesJson,
                show_languages AS showLanguages
         FROM profile_share_settings WHERE user_id = ?`,
      )
      .bind(user.id)
      .first<{
        countryCode: string;
        showLocation: number;
        languagesJson: string;
        showLanguages: number;
      }>(),
    db
      .prepare(
        `SELECT sorsa_score AS sorsaScore, sorsa_source AS sorsaSource,
                x_score AS xScore, x_score_source AS xScoreSource,
                updated_at AS updatedAt
         FROM profile_reputation_signals WHERE user_id = ?`,
      )
      .bind(user.id)
      .first<{
        sorsaScore: number | null;
        sorsaSource: string;
        xScore: number | null;
        xScoreSource: string;
        updatedAt: string;
      }>(),
  ]);
  return {
    user,
    profile,
    membership,
    socialAccounts,
    interests: interests.results,
    contacts: contacts.results,
    activity: activity ?? {
      unreadNotifications: 0,
      connections: 0,
      followedProjects: 0,
      upcomingEvents: 0,
    },
    adminAccess,
    shareSettings: shareSettings ?? {
      countryCode: "",
      showLocation: 0,
      languagesJson: "[]",
      showLanguages: 1,
    },
    reputationSignals: reputationSignals ?? {
      sorsaScore: null,
      sorsaSource: "unavailable",
      xScore: null,
      xScoreSource: "unavailable",
      updatedAt: null,
    },
    saved: new URL(request.url).searchParams.has("saved"),
    photoSaved: new URL(request.url).searchParams.has("photo"),
    welcome: new URL(request.url).searchParams.has("welcome"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const env = context.get(cloudflareContext).env;
  const user = await requireUser(request, db);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_300_000)
    return { error: "Profile photos must be 2 MB or smaller." };
  const formData = await request.formData();
  const intent = formText(formData.get("intent"));

  if (intent === "upload-photo") {
    await requireActionRateLimit(db, request, "profile-photo", user.id, 12, 60);
    const photo = formData.get("profilePhoto");
    if (!(photo instanceof File))
      return { error: "Choose a JPG, PNG or WebP profile photo." };
    const validPhoto = await validateProfilePhoto(photo);
    if (!validPhoto)
      return {
        error: "Choose a valid JPG, PNG or WebP image no larger than 2 MB.",
      };
    const previous = await db
      .prepare("SELECT avatar_key AS avatarKey FROM profiles WHERE user_id = ?")
      .bind(user.id)
      .first<{ avatarKey: string | null }>();
    const key = `profile-photos/${user.id}/${crypto.randomUUID()}.${validPhoto.extension}`;
    await env.MEDIA.put(key, photo.stream(), {
      httpMetadata: {
        contentType: validPhoto.contentType,
        cacheControl: "private, max-age=300",
      },
      customMetadata: { ownerId: user.id, purpose: "profile-photo" },
    });
    await registerManagedR2Object(db, {
      objectKey: key,
      sourceType: "profile_photo",
      sourceId: user.id,
      ownerUserId: user.id,
    });
    try {
      await db.batch([
        db
          .prepare(
            `UPDATE profiles SET avatar_key = ?, avatar_content_type = ?,
             avatar_updated_at = datetime('now'), updated_at = datetime('now')
             WHERE user_id = ?`,
          )
          .bind(key, validPhoto.contentType, user.id),
        db
          .prepare(
            `INSERT INTO audit_logs
             (id, actor_user_id, action, subject_type, subject_id)
             VALUES (?, ?, 'profile.photo_updated', 'profile', ?)`,
          )
          .bind(crypto.randomUUID(), user.id, user.id),
      ]);
    } catch (error) {
      await env.MEDIA.delete(key);
      await markManagedR2ObjectDeleted(db, key);
      throw error;
    }
    if (previous?.avatarKey && previous.avatarKey !== key) {
      await env.MEDIA.delete(previous.avatarKey);
      await markManagedR2ObjectDeleted(db, previous.avatarKey);
    }
    throw redirect("/app?photo=saved");
  }

  if (intent === "remove-photo") {
    const previous = await db
      .prepare("SELECT avatar_key AS avatarKey FROM profiles WHERE user_id = ?")
      .bind(user.id)
      .first<{ avatarKey: string | null }>();
    await db
      .prepare(
        `UPDATE profiles SET avatar_key = NULL, avatar_content_type = NULL,
         avatar_updated_at = datetime('now'), updated_at = datetime('now')
         WHERE user_id = ?`,
      )
      .bind(user.id)
      .run();
    if (previous?.avatarKey) {
      await env.MEDIA.delete(previous.avatarKey);
      await markManagedR2ObjectDeleted(db, previous.avatarKey);
    }
    throw redirect("/app?photo=saved");
  }

  const displayName = formText(formData.get("displayName")).trim();
  const headline = formText(formData.get("headline")).trim();
  const bio = formText(formData.get("bio")).trim();
  const location = formText(formData.get("location")).trim();
  const websiteUrl = normalizeWebsite(formData.get("websiteUrl"));
  const expertise = formText(formData.get("expertise")).trim();
  const openTo = formText(formData.get("openTo")).trim();
  const visibility = selectedVisibility(formData.get("visibility"));
  const selected = selectedRoles(formData);
  const showLocation = formData.get("showLocation") === "yes" ? 1 : 0;
  const showLanguages = formData.get("showLanguages") === "yes" ? 1 : 0;
  const languages = Array.from(
    new Set(
      formText(formData.get("languages"))
        .split(",")
        .map((language) => language.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const xScoreText = formText(formData.get("xScore")).trim();
  const sorsaScoreText = formText(formData.get("sorsaScore")).trim();
  const xScore = xScoreText === "" ? null : Number(xScoreText);
  const sorsaScore = sorsaScoreText === "" ? null : Number(sorsaScoreText);
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
  const contactEmail = formText(formData.get("contactEmail"))
    .trim()
    .toLowerCase();
  const telegramHandle = formText(formData.get("telegramHandle")).trim();
  const contactVisibility = formText(formData.get("contactVisibility"));
  const validContactVisibility = [
    "private",
    "connections",
    "project_interests",
    "connections_and_project_interests",
  ].includes(contactVisibility);
  if (
    (xScore !== null &&
      (!Number.isFinite(xScore) || xScore < 0 || xScore > 1_000)) ||
    (sorsaScore !== null &&
      (!Number.isFinite(sorsaScore) || sorsaScore < 0 || sorsaScore > 100))
  ) {
    return {
      error:
        "XScore must be between 0 and 1,000. Sorsa score must be between 0 and 100.",
      errorCode: "reputation" as const,
    };
  }
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
    languages.some((language) => language.length > 40) ||
    socialAccounts.some(
      ({ profileUrl, followerCount }) =>
        profileUrl === null ||
        (followerCount !== null &&
          (!Number.isSafeInteger(followerCount) ||
            followerCount < 0 ||
            followerCount > 2_000_000_000)),
    ) ||
    socialAccounts.some(
      ({ platform, profileUrl }) =>
        platform === "x" &&
        Boolean(profileUrl) &&
        !isXProfileUrl(profileUrl ?? ""),
    ) ||
    interestNote.length > 500 ||
    (contactEmail !== "" && !validateEmail(contactEmail)) ||
    (telegramHandle !== "" && !/^@?[a-zA-Z0-9_]{5,32}$/.test(telegramHandle)) ||
    !validContactVisibility
  ) {
    return {
      error:
        "Check your profile, social links, follower counts and selected roles.",
    };
  }
  const enforcedVisibility =
    user.accessTier === "member" ? visibility : "private";
  const previousRoles = await db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .bind(user.id)
    .all<{ role: (typeof selected)[number] }>();
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
    ...roleVerificationClaimStatements(
      db,
      user.id,
      previousRoles.results.map((row) => row.role),
      selected,
    ),
    db
      .prepare(
        `INSERT INTO profile_share_settings
           (user_id, country_code, show_location, languages_json, show_languages,
            updated_at)
         VALUES (?, '', ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           show_location = excluded.show_location,
           languages_json = excluded.languages_json,
           show_languages = excluded.show_languages,
           updated_at = excluded.updated_at`,
      )
      .bind(user.id, showLocation, JSON.stringify(languages), showLanguages),
    db
      .prepare(
        `INSERT INTO profile_reputation_signals
           (user_id, sorsa_score, sorsa_source, x_score, x_score_source, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           sorsa_score = excluded.sorsa_score,
           sorsa_source = CASE
             WHEN profile_reputation_signals.sorsa_score IS excluded.sorsa_score
               AND profile_reputation_signals.sorsa_source IN (
                 'official_api', 'partner_verified'
               )
             THEN profile_reputation_signals.sorsa_source
             ELSE excluded.sorsa_source END,
           x_score = excluded.x_score,
           x_score_source = CASE
             WHEN profile_reputation_signals.x_score IS excluded.x_score
               AND profile_reputation_signals.x_score_source IN (
                 'official_api', 'partner_verified'
               )
             THEN profile_reputation_signals.x_score_source
             ELSE excluded.x_score_source END,
           updated_at = excluded.updated_at`,
      )
      .bind(
        user.id,
        sorsaScore,
        sorsaScore === null ? "unavailable" : "member_reported",
        xScore,
        xScore === null ? "unavailable" : "member_reported",
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
            .bind(crypto.randomUUID(), user.id, interestType, interestNote)
        : db
            .prepare(
              `UPDATE interest_requests SET status = 'withdrawn',
               updated_at = datetime('now')
               WHERE user_id = ? AND interest_type = ? AND status = 'pending'`,
            )
            .bind(user.id, interestType),
    ),
    ...[
      ["email", contactEmail],
      [
        "telegram",
        telegramHandle ? `@${telegramHandle.replace(/^@/, "")}` : "",
      ],
    ].map(([contactType, contactValue]) =>
      contactValue
        ? db
            .prepare(
              `INSERT INTO profile_contacts
               (user_id, contact_type, contact_value, visibility, updated_at)
               VALUES (?, ?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, contact_type) DO UPDATE SET
                 contact_value = excluded.contact_value,
                 visibility = excluded.visibility,
                 verified_at = NULL,
                 updated_at = excluded.updated_at`,
            )
            .bind(user.id, contactType, contactValue, contactVisibility)
        : db
            .prepare(
              "DELETE FROM profile_contacts WHERE user_id = ? AND contact_type = ?",
            )
            .bind(user.id, contactType),
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
  const contactMap = new Map(
    loaderData.contacts.map((contact) => [
      contact.contactType,
      contact.contactValue,
    ]),
  );
  const savedContactVisibility =
    loaderData.contacts[0]?.visibility ?? "connections";
  const membershipLabel =
    {
      pending_email: "Email confirmation needed",
      pending_review: "Application under review",
      approved: "Approved member",
      declined: "Application reviewed",
      waitlisted: "Membership waitlist",
    }[loaderData.membership?.status ?? "pending_review"] ??
    "Application under review";
  const spokenLanguages = (() => {
    try {
      const parsed: unknown = JSON.parse(
        loaderData.shareSettings.languagesJson,
      );
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  })();
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="dashboard-main">
        <nav className="dashboard-nav" aria-label="Your House">
          <span className="eyebrow">Your House</span>
          <Link className="active" aria-current="page" to="/app">
            Overview
          </Link>
          <ScrollTo targetId="member-home">Account status</ScrollTo>
          <ScrollTo targetId="role-workspaces">Profile readiness</ScrollTo>
          <ScrollTo targetId="profile-editor">Edit profile</ScrollTo>
          <ScrollTo targetId="privacy-controls">Privacy and security</ScrollTo>
          <Link to="/projects">Projects</Link>
          {loaderData.user.roles.includes("founder") &&
            loaderData.user.accessTier === "member" && (
              <Link to="/projects/manage">My projects</Link>
            )}
          <Link to="/events">Events</Link>
          {loaderData.interests.some(
            (interest) =>
              interest.interestType === "event_host" &&
              interest.status === "approved",
          ) && <Link to="/events/manage">My events</Link>}
          <Link to="/connections">Connections</Link>
          <Link to="/members">Discover members</Link>
          <Link to="/notifications">Notifications</Link>
          {loaderData.adminAccess && <Link to="/admin">Admin workspace</Link>}
          <Link to="/settings/telegram">Telegram</Link>
          {loaderData.adminAccess?.canManageCampaigns === 1 && (
            <>
              <Link to="/admin/campaigns">IIO control room</Link>
              <Link to="/admin/integrations/google">Google Sheets</Link>
            </>
          )}
          {loaderData.adminAccess?.canModerate === 1 && (
            <>
              <Link to="/admin/moderation">Moderation</Link>
              <Link to="/admin/contact">Contact desk</Link>
            </>
          )}
          {loaderData.adminAccess?.accessLevel === "superadmin" && (
            <>
              <span className="dashboard-nav-section-label">Superadmin</span>
              <Link className="dashboard-nav-admin" to="/admin/house-directory">
                People &amp; Partners
              </Link>
              <Link className="dashboard-nav-admin" to="/admin/team">
                Admin team
              </Link>
            </>
          )}
        </nav>
        <section className="dashboard-content">
          {loaderData.adminAccess?.accessLevel === "superadmin" && (
            <nav
              className="dashboard-mobile-tools"
              aria-label="Superadmin tools"
            >
              <span>Superadmin</span>
              <Link to="/admin/house-directory">People &amp; Partners</Link>
              <Link to="/admin/team">Admin team</Link>
            </nav>
          )}
          {loaderData.welcome && (
            <div className="notice">
              Welcome to AKARI House. Your profile starts private.
            </div>
          )}
          {loaderData.saved && (
            <div className="notice success" role="status">
              Profile saved.
            </div>
          )}
          {loaderData.photoSaved && (
            <div className="notice success" role="status">
              Profile photo updated.
            </div>
          )}
          {!isMember && (
            <div className="notice applicant-notice">
              <strong>Your applicant profile is open.</strong> You can keep your
              biography, photo, roles, languages, social links and interests
              current while the Membership Desk reviews your application. Your
              profile remains private to everyone except you.
            </div>
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
              {isMember ? "View profile" : "Preview private profile"}
            </Link>
          </div>
          <section
            className="member-home"
            id="member-home"
            aria-labelledby="member-home-title"
          >
            <div className="member-home-intro">
              <span className="chapter">Your place in the House</span>
              <h2 id="member-home-title">{membershipLabel}</h2>
              <p>
                {isMember
                  ? "Your member spaces are open. Continue a conversation, follow an opportunity or keep your profile current."
                  : "You can keep your lightweight profile and interests current while the Membership Desk completes its review."}
              </p>
              <span
                className={`membership-seal status-${loaderData.membership?.status ?? "pending_review"}`}
              >
                {membershipLabel}
              </span>
            </div>
            <div className="member-home-stats" aria-label="Account activity">
              <Link to="/notifications">
                <strong>{loaderData.activity.unreadNotifications}</strong>
                <span>Unread updates</span>
              </Link>
              <Link to="/connections">
                <strong>{loaderData.activity.connections}</strong>
                <span>Connections</span>
              </Link>
              <Link to="/projects">
                <strong>{loaderData.activity.followedProjects}</strong>
                <span>Followed projects</span>
              </Link>
              <Link to="/events">
                <strong>{loaderData.activity.upcomingEvents}</strong>
                <span>Event places</span>
              </Link>
            </div>
            <nav
              className="member-next-actions"
              aria-label="Recommended next steps"
            >
              <Link className="button button-primary" to="/projects">
                Discover projects
              </Link>
              <Link className="button button-quiet" to="/events">
                Explore events
              </Link>
              <ScrollTo className="quiet-link" targetId="profile-editor">
                Continue your profile
              </ScrollTo>
            </nav>
          </section>
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
            aria-labelledby="role-workspaces-title"
            className="dashboard-workspace"
          >
            <span className="chapter">Role workspaces</span>
            <h2 id="role-workspaces-title">
              Continue from the role you need now.
            </h2>
            <p>
              Every workspace uses the same profile, privacy choices and trusted
              network.
            </p>
            <DashboardRoleActions user={loaderData.user} />
          </section>
          <ProfilePhotoEditor
            avatarKey={loaderData.profile.avatarKey}
            displayName={loaderData.profile.displayName}
            error={actionData?.error}
            isMember={isMember}
            username={loaderData.user.username}
          />
          <Form method="post" className="profile-form" id="profile-editor">
            <div className="form-row">
              <label>
                Display name
                <input
                  name="displayName"
                  autoComplete="name"
                  defaultValue={loaderData.profile.displayName}
                  required
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  autoComplete="address-level2"
                  defaultValue={loaderData.profile.location}
                  placeholder="Berlin, Germany"
                />
              </label>
            </div>
            <fieldset className="profile-panel" id="location-language-sharing">
              <legend>Location and languages</legend>
              <p className="field-help">
                These choices apply everywhere AKARI shows your profile,
                including member search and your sharing card.
              </p>
              <label>
                Languages spoken
                <input
                  name="languages"
                  defaultValue={spokenLanguages.join(", ")}
                  placeholder="English, Croatian, Japanese"
                  aria-describedby="languages-help"
                />
                <small id="languages-help">
                  Separate up to 10 languages with commas.
                </small>
              </label>
              <div className="interest-grid">
                <label>
                  <input
                    type="checkbox"
                    name="showLocation"
                    value="yes"
                    defaultChecked={loaderData.shareSettings.showLocation === 1}
                  />
                  <span>Show my location on visible profiles and cards</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="showLanguages"
                    value="yes"
                    defaultChecked={
                      loaderData.shareSettings.showLanguages === 1
                    }
                  />
                  <span>
                    Show my spoken languages on visible profiles and cards
                  </span>
                </label>
              </div>
            </fieldset>
            <label>
              Professional headline
              <input
                name="headline"
                maxLength={120}
                aria-describedby="headline-help"
                defaultValue={loaderData.profile.headline}
                placeholder="Founder building trusted creator infrastructure"
              />
              <small id="headline-help">
                A concise introduction, up to 120 characters.
              </small>
            </label>
            <label>
              Biography
              <textarea
                name="bio"
                rows={5}
                maxLength={600}
                aria-describedby="bio-help"
                defaultValue={loaderData.profile.bio}
                placeholder="What should trusted members know about you?"
              />
              <small id="bio-help">
                Share useful context in up to 600 characters.
              </small>
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
                autoComplete="url"
                aria-describedby="website-help"
                defaultValue={loaderData.profile.websiteUrl}
                placeholder="https://example.com"
              />
              <small id="website-help">HTTPS links only.</small>
            </label>
            <RoleSelector selected={loaderData.user.roles} />
            <fieldset className="profile-panel" id="social-links">
              <legend>Social presence</legend>
              <p className="field-help">
                X is the primary Creator identity; other networks are optional.
                Counts you enter are labelled member-reported.
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
                        inputMode="numeric"
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
            <fieldset className="profile-panel" id="creator-readiness">
              <legend>Creator campaign readiness</legend>
              <p className="field-help">
                Creators need a primary X profile plus current XScore and Sorsa
                score before applying to a campaign. Member-reported scores are
                clearly labelled until a partner or Admin verifies them.
              </p>
              {actionData &&
                "errorCode" in actionData &&
                actionData.errorCode === "reputation" && (
                  <p className="field-error" role="alert">
                    {actionData.error}
                  </p>
                )}
              <div className="form-row">
                <label>
                  XScore
                  <input
                    name="xScore"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1_000}
                    step="0.01"
                    defaultValue={loaderData.reputationSignals.xScore ?? ""}
                    placeholder="0 to 1,000"
                    aria-describedby="x-score-help"
                  />
                  <small id="x-score-help">
                    Enter your current XScore on its 0–1,000 scale.
                  </small>
                </label>
                <label>
                  Sorsa score
                  <input
                    name="sorsaScore"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={loaderData.reputationSignals.sorsaScore ?? ""}
                    placeholder="0 to 100"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="profile-panel" id="interest-requests">
              <legend>What would you like to explore?</legend>
              <p className="field-help">
                Showing interest is not automatic access. The AKARI team reviews
                ambassador, project and event-host requests.
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
            <fieldset className="profile-panel" id="contact-sharing">
              <legend>Private contact sharing</legend>
              <p className="field-help">
                These details never appear publicly. A connection is mutual only
                after acceptance. Project-interest sharing also requires your
                explicit consent on the individual interest.
              </p>
              <div className="form-row">
                <label>
                  Contact email
                  <input
                    name="contactEmail"
                    type="email"
                    autoComplete="email"
                    defaultValue={contactMap.get("email") ?? ""}
                  />
                </label>
                <label>
                  Telegram handle
                  <input
                    name="telegramHandle"
                    autoComplete="off"
                    defaultValue={contactMap.get("telegram") ?? ""}
                    placeholder="@username"
                    pattern="@?[a-zA-Z0-9_]{5,32}"
                  />
                  <small>
                    A handle is contact information, not a linked Telegram
                    account.
                  </small>
                </label>
              </div>
              <label>
                Who may receive these details?
                <select
                  name="contactVisibility"
                  defaultValue={savedContactVisibility}
                >
                  <option value="private">Only me</option>
                  <option value="connections">Mutual connections</option>
                  <option value="project_interests">
                    Explicit project-interest sharing
                  </option>
                  <option value="connections_and_project_interests">
                    Mutual connections and explicit project interests
                  </option>
                </select>
              </label>
            </fieldset>
            <fieldset className="visibility-fieldset" id="privacy-controls">
              <legend>Who can see your profile?</legend>
              {!isMember && (
                <p className="field-help">
                  Applicant profiles are enforced as private. Visibility choices
                  unlock after membership approval.
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
              {navigation.state === "submitting"
                ? "Saving profile…"
                : "Save profile"}
            </button>
          </Form>
        </section>
      </main>
    </div>
  );
}
