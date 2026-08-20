import { redirect } from "react-router";
import type { Route } from "./+types/profile-card";
import { ProfileShareCard } from "~/components/ProfileShareCard";
import { SiteHeader } from "~/components/SiteHeader";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  MAX_PROFILE_CARD_LANGUAGES,
  PROFILE_CARD_DESIGNS,
  PROFILE_CARD_ORIENTATIONS,
  PROFILE_CARD_PALETTES,
  PROFILE_CARD_SOCIAL_PLATFORMS,
  normaliseProfileCardLanguages,
  type ProfileCardModel,
  type ProfileCardSettings,
  type ProfileCardSocial,
} from "~/lib/profile-card";
import {
  calculateAkariPercentile,
  type MemberSignals,
  type SignalSource,
} from "~/lib/profile-percentile";
import { roleVerificationStates } from "~/lib/role-verification.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

async function safeFirst<T>(statement: () => Promise<T | null>, fallback: T) {
  try {
    return (await statement()) ?? fallback;
  } catch {
    return fallback;
  }
}

type SocialRow = {
  platform: string;
  profileUrl: string;
  followerCount: number | null;
  countSource: SignalSource;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const [
    profile,
    roles,
    socials,
    settings,
    opportunityStats,
    reputation,
    population,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT p.display_name AS displayName, COALESCE(p.headline, '') AS headline,
                  COALESCE(p.location, '') AS location,
                  COALESCE(p.avatar_key, '') AS avatarKey,
                  COALESCE(pv.visibility, p.visibility) AS visibility
             FROM profiles p
             LEFT JOIN profile_visibility pv ON pv.user_id = p.user_id
            WHERE p.user_id = ?`,
      )
      .bind(user.id)
      .first<{
        displayName: string;
        headline: string;
        location: string;
        avatarKey: string;
        visibility: string;
      }>(),
    db
      .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
      .bind(user.id)
      .all<{ role: string }>(),
    db
      .prepare(
        `SELECT platform, COALESCE(profile_url, '') AS profileUrl,
                  follower_count AS followerCount, count_source AS countSource
             FROM profile_social_accounts
            WHERE user_id = ? AND COALESCE(profile_url, '') <> ''
            ORDER BY platform`,
      )
      .bind(user.id)
      .all<SocialRow>(),
    safeFirst<ProfileCardSettings>(
      () =>
        db
          .prepare(
            `SELECT design, orientation, palette, country_code AS countryCode,
                      show_location AS showLocation,
                      languages_json AS languagesJson,
                      show_languages AS showLanguages
                 FROM profile_share_settings WHERE user_id = ?`,
          )
          .bind(user.id)
          .first<ProfileCardSettings>(),
      {
        design: "signature",
        orientation: "landscape",
        palette: "sakura",
        countryCode: "",
        showLocation: 0,
        languagesJson: "[]",
        showLanguages: 1,
      },
    ),
    safeFirst(
      () =>
        db
          .prepare(
            `SELECT
                 (SELECT COUNT(*)
                    FROM projects p
                    JOIN opportunity_listings listing ON listing.project_id = p.id
                   WHERE p.founder_user_id = ?
                     AND listing.status IN ('published', 'closed', 'archived')) AS created,
                 (SELECT COUNT(*) FROM data_room_requests
                   WHERE investor_user_id = ? AND status = 'approved') AS received`,
          )
          .bind(user.id, user.id)
          .first<{ created: number; received: number }>(),
      { created: 0, received: 0 },
    ),
    safeFirst(
      () =>
        db
          .prepare(
            `SELECT sorsa_score AS sorsaScore, sorsa_source AS sorsaSource,
                      x_score AS xScore, x_score_source AS xScoreSource
                 FROM profile_reputation_signals WHERE user_id = ?`,
          )
          .bind(user.id)
          .first<{
            sorsaScore: number | null;
            sorsaSource: SignalSource;
            xScore: number | null;
            xScoreSource: SignalSource;
          }>(),
      {
        sorsaScore: null,
        sorsaSource: "unavailable",
        xScore: null,
        xScoreSource: "unavailable",
      },
    ),
    safeFirst(
      async () => {
        const rows = await db
          .prepare(
            `SELECT u.id AS userId, prs.sorsa_score AS sorsaScore,
                      COALESCE(prs.sorsa_source, 'unavailable') AS sorsaSource,
                      prs.x_score AS xScore,
                      COALESCE(prs.x_score_source, 'unavailable') AS xScoreSource,
                      SUM(COALESCE(psa.follower_count, 0)) AS following,
                      CASE
                        WHEN SUM(CASE WHEN psa.count_source = 'official_api' THEN 1 ELSE 0 END) > 0
                        THEN 'official_api'
                        WHEN SUM(CASE WHEN psa.follower_count IS NOT NULL THEN 1 ELSE 0 END) > 0
                        THEN 'member_reported'
                        ELSE 'unavailable'
                      END AS followingSource
                 FROM users u
                 LEFT JOIN profile_reputation_signals prs ON prs.user_id = u.id
                 LEFT JOIN profile_social_accounts psa ON psa.user_id = u.id
                WHERE u.status = 'active'
                GROUP BY u.id`,
          )
          .all<MemberSignals & { userId: string }>();
        return { rows: rows.results };
      },
      { rows: [] as Array<MemberSignals & { userId: string }> },
    ),
  ]);

  if (!profile) throw new Response("Profile missing", { status: 500 });

  const connectedSocials = socials.results.filter(
    (social): social is ProfileCardSocial =>
      PROFILE_CARD_SOCIAL_PLATFORMS.includes(
        social.platform as ProfileCardSocial["platform"],
      ),
  );
  const followerCount = connectedSocials.reduce(
    (sum, social) => sum + (social.followerCount ?? 0),
    0,
  );
  const followingSource: SignalSource = connectedSocials.some(
    (social) =>
      social.countSource === "official_api" ||
      social.countSource === "partner_verified",
  )
    ? "official_api"
    : followerCount > 0
      ? "member_reported"
      : "unavailable";
  const memberSignals: MemberSignals = {
    ...reputation,
    following: followerCount || null,
    followingSource,
  };
  const percentile = calculateAkariPercentile(memberSignals, population.rows);
  const verificationStates = await roleVerificationStates(db, user.id);

  const model: ProfileCardModel = {
    username: user.username,
    accessTier: user.accessTier,
    displayName: profile.displayName,
    headline: profile.headline,
    location: profile.location,
    avatarKey: profile.avatarKey,
    visibility: profile.visibility,
    roles: roles.results.map((row) => row.role),
    socials: connectedSocials,
    settings,
    opportunityStats,
    followerCount,
    percentile,
    verificationStates: verificationStates.map((state) => ({
      role: state.role,
      status: state.status,
    })),
  };

  return {
    user,
    model,
    saved: new URL(request.url).searchParams.has("saved"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const form = await request.formData();
  const design = formText(form.get("design"));
  const orientation = formText(form.get("orientation"));
  const palette = formText(form.get("palette"));
  const countryCode = formText(form.get("countryCode")).trim().toUpperCase();
  const showLocation = form.get("showLocation") === "on" ? 1 : 0;
  const showLanguages = form.get("showLanguages") === "on" ? 1 : 0;
  const languageCandidates = formText(form.get("languages"))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const languages = normaliseProfileCardLanguages(languageCandidates);

  if (
    !PROFILE_CARD_DESIGNS.includes(
      design as (typeof PROFILE_CARD_DESIGNS)[number],
    ) ||
    !PROFILE_CARD_ORIENTATIONS.includes(
      orientation as (typeof PROFILE_CARD_ORIENTATIONS)[number],
    ) ||
    !PROFILE_CARD_PALETTES.includes(
      palette as (typeof PROFILE_CARD_PALETTES)[number],
    ) ||
    (countryCode !== "" && !/^[A-Z]{2}$/.test(countryCode)) ||
    languageCandidates.length > MAX_PROFILE_CARD_LANGUAGES ||
    languageCandidates.some((language) => language.length > 30)
  ) {
    return { error: "Check the card style, country code and languages." };
  }

  await db
    .prepare(
      `INSERT INTO profile_share_settings
       (user_id, design, orientation, palette, country_code, show_location,
        languages_json, show_languages, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         design = excluded.design, orientation = excluded.orientation,
         palette = excluded.palette, country_code = excluded.country_code,
         show_location = excluded.show_location,
         languages_json = excluded.languages_json,
         show_languages = excluded.show_languages,
         updated_at = excluded.updated_at`,
    )
    .bind(
      user.id,
      design,
      orientation,
      palette,
      countryCode,
      showLocation,
      JSON.stringify(languages),
      showLanguages,
    )
    .run();

  throw redirect("/profile-card?saved=1");
}

const profileCardWorkspaceStyles = `
/* R93: make the sharing card read like a credible identity object, not a decoration. */
.glass-share-page .glass-card-metrics {
  position: absolute !important;
  right: 7.5% !important;
  bottom: 21.2% !important;
  left: 7.5% !important;
  z-index: 2 !important;
  min-height: 11.5% !important;
  padding: 0 1.5cqi !important;
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  align-items: stretch !important;
  gap: 0 !important;
  overflow: hidden !important;
  border: 1px solid color-mix(in srgb, var(--card-ink) 28%, transparent) !important;
  border-radius: clamp(9px, 2cqi, 14px) !important;
  background: color-mix(in srgb, var(--card-bg) 72%, var(--card-surface)) !important;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--card-ink) 18%, transparent),
    0 10px 22px rgb(0 0 0 / 13%) !important;
  backdrop-filter: blur(14px) !important;
}

.glass-share-page .glass-card-metrics > div {
  min-width: 0;
  padding: 0.55cqi 1.45cqi;
  display: grid;
  align-content: center;
  gap: 0.08cqi;
}

.glass-share-page .glass-card-metrics > div + div {
  border-left: 1px solid color-mix(in srgb, var(--card-ink) 20%, transparent);
}

.glass-share-page .glass-card-metrics strong {
  overflow: hidden;
  color: var(--card-highlight);
  font-size: clamp(0.62rem, 2.15cqi, 0.94rem) !important;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.glass-share-page .glass-card-metrics > div:nth-child(2) strong,
.glass-share-page .glass-card-metrics > div:nth-child(3) strong {
  color: var(--card-accent);
}

.glass-share-page .glass-card-metrics span {
  overflow: hidden;
  color: var(--card-ink);
  font-size: clamp(0.3rem, 0.82cqi, 0.4rem) !important;
  font-weight: 750;
  line-height: 1.1;
  letter-spacing: 0.075em;
  opacity: 0.62;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.glass-share-page .glass-profile-qr-panel {
  top: 22.7% !important;
  min-height: 38.5% !important;
}

.glass-share-page .glass-connect-strip {
  left: 7.5% !important;
  bottom: 9.5% !important;
  width: 63.5% !important;
  min-height: 8.9% !important;
  padding-inline: 1.8cqi !important;
  gap: 1.7cqi !important;
}

.glass-share-page .glass-connect-strip::after {
  display: none !important;
  content: none !important;
}

.glass-share-page .glass-connect-strip > strong {
  width: auto !important;
  flex: 0 0 auto !important;
  padding-right: 0.35cqi;
  font-size: clamp(0.42rem, 1.08cqi, 0.58rem) !important;
}

.glass-share-page .glass-card-socials {
  min-width: 0;
  gap: clamp(0.36rem, 1.25cqi, 0.62rem) !important;
}

.glass-share-page .glass-card-socials a,
.glass-share-page .glass-social-more {
  width: clamp(1.18rem, 3.75cqi, 1.6rem) !important;
  height: clamp(1.18rem, 3.75cqi, 1.6rem) !important;
}

.glass-share-page .glass-card-socials a {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--card-ink) 14%, transparent),
    0 5px 12px rgb(0 0 0 / 14%) !important;
}

.glass-share-page .glass-card-socials svg {
  width: clamp(0.56rem, 1.5cqi, 0.7rem) !important;
  height: clamp(0.56rem, 1.5cqi, 0.7rem) !important;
}

.glass-share-page .glass-card-footer {
  right: 7.5% !important;
  bottom: 3.2% !important;
  left: 7.5% !important;
  min-height: 3.3% !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

.glass-share-page .glass-card-footer::before {
  display: none !important;
  content: none !important;
}

.glass-share-page .glass-card-footer::after {
  content: "AKARI member identity" !important;
  font-size: clamp(0.28rem, 0.72cqi, 0.36rem) !important;
  letter-spacing: 0.02em;
  opacity: 0.52;
}

.glass-share-page .glass-card-footer-brand {
  font-size: clamp(0.3rem, 0.8cqi, 0.4rem) !important;
  letter-spacing: 0.03em;
  opacity: 0.72;
}

.glass-share-page .glass-card-note {
  align-items: flex-start !important;
  line-height: 1.45;
}

.glass-share-page .share-card-confidence {
  color: color-mix(in srgb, var(--muted) 82%, white 18%);
  line-height: 1.45;
  text-align: center;
}

.glass-share-page .glass-card-controls > fieldset:first-of-type {
  grid-column: 1 / -1 !important;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.glass-share-page .glass-card-controls > fieldset:first-of-type legend {
  grid-column: 1 / -1;
}

.glass-share-page .glass-card-controls > fieldset:first-of-type label {
  min-height: 46px;
  margin: 0;
  padding: 0.65rem 0.72rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 11px;
  background: rgb(255 255 255 / 2.5%);
}

.glass-share-page .share-card-check {
  min-height: 44px;
  padding: 0.6rem 0.72rem !important;
  display: flex !important;
  align-items: center !important;
  gap: 0.55rem !important;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 11px;
  background: rgb(255 255 255 / 2.5%);
  line-height: 1.25;
}

.glass-share-page .share-card-check input {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

@media (min-width: 981px) {
  .glass-share-page.share-card-main {
    width: min(1120px, calc(100% - 2rem)) !important;
  }

  .glass-share-page .share-card-heading {
    max-width: none !important;
    margin-bottom: 1rem;
    align-items: center;
  }

  .glass-share-page .share-card-heading h1 {
    margin-block: 0.35rem 0.45rem;
    font-size: clamp(2rem, 3.2vw, 2.7rem);
  }

  .glass-share-page .share-card-heading p {
    max-width: 58ch;
    font-size: 0.94rem;
    line-height: 1.5;
  }

  .glass-share-page .share-card-layout {
    grid-template-columns: minmax(0, 620px) minmax(320px, 360px) !important;
    justify-content: center !important;
    align-items: start !important;
    gap: 1.25rem !important;
  }

  .glass-share-page .share-card-stage.glass-card-stage {
    width: 100% !important;
    margin: 0 !important;
    padding: 0.8rem !important;
    border-radius: 18px !important;
  }

  .glass-card-stage .glass-profile-card.akari-share-card {
    width: min(100%, 580px) !important;
  }

  .glass-share-page .glass-card-note {
    margin-top: 0.65rem !important;
    font-size: 0.7rem !important;
  }

  .glass-share-page .share-card-confidence {
    margin-top: 0.45rem;
    font-size: 0.68rem;
  }

  .glass-share-page .share-card-controls.glass-card-controls {
    width: 100% !important;
    margin: 0 !important;
    padding: 1rem !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.75rem !important;
    border-radius: 18px !important;
  }

  .glass-share-page .glass-card-controls .glass-palette-fieldset,
  .glass-share-page .glass-card-controls .profile-card-language-control,
  .glass-share-page .glass-card-controls .share-card-actions,
  .glass-share-page .glass-card-controls > small {
    grid-column: 1 / -1 !important;
  }

  .glass-share-page .glass-palette-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 0.5rem !important;
  }

  .glass-share-page .glass-palette-choice {
    min-height: 58px !important;
    padding: 0.5rem !important;
    gap: 0.45rem !important;
  }

  .glass-share-page .glass-palette-choice small {
    display: none !important;
  }

  .glass-share-page .glass-palette-swatch {
    width: 1.7rem !important;
    height: 1.7rem !important;
  }
}

@media (max-width: 700px) {
  .glass-share-page .glass-card-metrics {
    bottom: 21% !important;
    min-height: 11.2% !important;
    padding-inline: 1cqi !important;
  }

  .glass-share-page .glass-card-metrics > div {
    padding-inline: 0.8cqi;
  }

  .glass-share-page .glass-connect-strip {
    bottom: 9.4% !important;
    min-height: 8.6% !important;
    padding-inline: 1.4cqi !important;
    gap: 1.05cqi !important;
  }

  .glass-share-page .glass-card-socials {
    gap: 0.95cqi !important;
  }

  .glass-share-page .glass-card-footer::after {
    display: none !important;
  }
}
`;

export default function ProfileCard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <style>{profileCardWorkspaceStyles}</style>
      <ProfileShareCard
        model={loaderData.model}
        saved={loaderData.saved}
        error={actionData?.error}
      />
    </div>
  );
}
