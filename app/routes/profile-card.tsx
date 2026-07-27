import { Form, Link, redirect, useNavigation } from "react-router";
import { useMemo, useState } from "react";
import type { Route } from "./+types/profile-card";
import { SiteHeader } from "~/components/SiteHeader";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import {
  calculateAkariPercentile,
  type MemberSignals,
  type SignalSource,
} from "~/lib/profile-percentile";

const palettes = {
  sakura: {
    label: "Sakura",
    background: "#f04f87",
    ink: "#fff9f5",
    accent: "#ffd166",
  },
  midnight: {
    label: "Midnight",
    background: "#0b0d16",
    ink: "#fff9f5",
    accent: "#f04f87",
  },
  lantern: {
    label: "Lantern",
    background: "#ffd166",
    ink: "#17101a",
    accent: "#f04f87",
  },
} as const;

const platforms = [
  "x",
  "linkedin",
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
] as const;

type CardSettings = {
  design: "signature" | "passport";
  orientation: "landscape" | "portrait";
  palette: keyof typeof palettes;
  countryCode: string;
  showLocation: number;
  languagesJson: string;
};

type Social = {
  platform: string;
  profileUrl: string;
  followerCount: number | null;
  countSource: SignalSource;
};

function flagFor(code: string) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(
        ...[...code].map((letter) => 127397 + letter.charCodeAt(0)),
      )
    : "";
}

function safeLanguages(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

async function safeFirst<T>(statement: () => Promise<T | null>, fallback: T) {
  try {
    return (await statement()) ?? fallback;
  } catch {
    return fallback;
  }
}

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
                  COALESCE(p.location, '') AS location, COALESCE(p.avatar_key, '') AS avatarKey
             FROM profiles p WHERE p.user_id = ?`,
      )
      .bind(user.id)
      .first<{
        displayName: string;
        headline: string;
        location: string;
        avatarKey: string;
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
      .all<Social>(),
    safeFirst<CardSettings>(
      () =>
        db
          .prepare(
            `SELECT design, orientation, palette, country_code AS countryCode,
                      show_location AS showLocation, languages_json AS languagesJson
                 FROM profile_share_settings WHERE user_id = ?`,
          )
          .bind(user.id)
          .first<CardSettings>(),
      {
        design: "signature",
        orientation: "landscape",
        palette: "sakura",
        countryCode: "",
        showLocation: 0,
        languagesJson: "[]",
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
  const followerCount = socials.results.reduce(
    (sum, social) => sum + (social.followerCount ?? 0),
    0,
  );
  const followingSource: SignalSource = socials.results.some(
    (social) => social.countSource === "official_api",
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
  return {
    user,
    profile,
    roles: roles.results.map((row) => row.role),
    socials: socials.results.filter((social) =>
      platforms.includes(social.platform as (typeof platforms)[number]),
    ),
    settings,
    opportunityStats,
    followerCount,
    percentile,
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
  const languages = formText(form.get("languages"))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (
    !["signature", "passport"].includes(design) ||
    !["landscape", "portrait"].includes(orientation) ||
    !Object.hasOwn(palettes, palette) ||
    (countryCode !== "" && !/^[A-Z]{2}$/.test(countryCode)) ||
    languages.some((language) => language.length > 30)
  ) {
    return { error: "Check the card style, country code and languages." };
  }

  await db
    .prepare(
      `INSERT INTO profile_share_settings
       (user_id, design, orientation, palette, country_code, show_location,
        languages_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         design = excluded.design, orientation = excluded.orientation,
         palette = excluded.palette, country_code = excluded.country_code,
         show_location = excluded.show_location,
         languages_json = excluded.languages_json,
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
    )
    .run();
  throw redirect("/profile-card?saved=1");
}

function drawCard(
  canvas: HTMLCanvasElement,
  data: Route.ComponentProps["loaderData"],
  settings: CardSettings,
) {
  const portrait = settings.orientation === "portrait";
  canvas.width = portrait ? 1080 : 1600;
  canvas.height = portrait ? 1350 : 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = palettes[settings.palette];
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createRadialGradient(
    canvas.width * 0.82,
    canvas.height * 0.18,
    10,
    canvas.width * 0.82,
    canvas.height * 0.18,
    canvas.width * 0.65,
  );
  gradient.addColorStop(0, palette.accent + "66");
  gradient.addColorStop(1, palette.background + "00");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 5;
  ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 34px Inter, sans-serif";
  ctx.fillText("AKARI HOUSE", 86, 112);
  ctx.fillStyle = palette.accent;
  ctx.font = "700 22px Inter, sans-serif";
  ctx.fillText(
    settings.design === "passport" ? "MEMBER PASSPORT" : "MEMBER SIGNATURE",
    86,
    154,
  );
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${portrait ? 74 : 82}px Inter, sans-serif`;
  ctx.fillText(data.profile.displayName.slice(0, 24), 86, portrait ? 360 : 430);
  ctx.font = "500 34px Inter, sans-serif";
  ctx.fillText("@" + data.user.username, 90, portrait ? 414 : 488);
  ctx.font = "600 27px Inter, sans-serif";
  ctx.fillText(
    data.roles.map((role) => role[0].toUpperCase() + role.slice(1)).join(" · "),
    90,
    portrait ? 470 : 548,
  );
  ctx.font = "500 24px Inter, sans-serif";
  const opportunityText = `${data.opportunityStats.created} created · ${data.opportunityStats.received} received`;
  ctx.fillText(opportunityText, 90, portrait ? 700 : 760);
  const percentileText = data.percentile.topPercent
    ? `Top ${data.percentile.topPercent}% on AKARI`
    : "Percentile building";
  ctx.font = "700 40px Inter, sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.fillText(percentileText, 90, portrait ? 765 : 825);
  ctx.font = "500 23px Inter, sans-serif";
  ctx.fillStyle = palette.ink;
  const location =
    settings.showLocation && settings.countryCode
      ? `${flagFor(settings.countryCode)} ${settings.countryCode}`
      : "Location private";
  ctx.fillText(location, 90, portrait ? 840 : 886);
  const languages = safeLanguages(settings.languagesJson);
  if (languages.length)
    ctx.fillText(
      "Languages · " + languages.join(" · "),
      90,
      portrait ? 890 : 930,
    );
  ctx.textAlign = "right";
  ctx.font = "700 110px Inter, sans-serif";
  ctx.fillStyle = palette.accent;
  ctx.fillText("✦", canvas.width - 90, 150);
  ctx.textAlign = "left";
}

export default function ProfileCard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<CardSettings>(loaderData.settings);
  const languages = useMemo(
    () => safeLanguages(settings.languagesJson).join(", "),
    [settings.languagesJson],
  );
  const title = loaderData.roles
    .map((role) => role[0].toUpperCase() + role.slice(1))
    .join(" · ");
  const palette = palettes[settings.palette];
  const location =
    settings.showLocation && settings.countryCode
      ? `${flagFor(settings.countryCode)} ${settings.countryCode}`
      : "Location private";

  function download() {
    const canvas = document.createElement("canvas");
    drawCard(canvas, loaderData, settings);
    const link = document.createElement("a");
    link.download = `akari-${loaderData.user.username}-${settings.orientation}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function share() {
    const canvas = document.createElement("canvas");
    drawCard(canvas, loaderData, settings);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], `akari-${loaderData.user.username}.png`, {
      type: "image/png",
    });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `${loaderData.profile.displayName} on AKARI House`,
        text: "Connect with me on AKARI House.",
        url: `${window.location.origin}/profiles/${loaderData.user.username}`,
        files: [file],
      });
    } else {
      await navigator.clipboard.writeText(
        `${window.location.origin}/profiles/${loaderData.user.username}`,
      );
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="share-card-main">
        <header className="share-card-heading">
          <div>
            <span className="eyebrow">Your AKARI identity</span>
            <h1>Profile sharing card</h1>
            <p>
              Choose an AKARI style, protect what stays private, then download
              or share.
            </p>
          </div>
          <Link
            className="quiet-link"
            to={`/profiles/${loaderData.user.username}`}
          >
            View public profile
          </Link>
        </header>

        {loaderData.saved && (
          <p className="success-banner">Card preferences saved.</p>
        )}
        {actionData?.error && <p className="form-error">{actionData.error}</p>}

        <div className="share-card-layout">
          <section className="share-card-stage" aria-label="Card preview">
            <article
              className={`akari-share-card ${settings.orientation} ${settings.design}`}
              style={
                {
                  "--card-bg": palette.background,
                  "--card-ink": palette.ink,
                  "--card-accent": palette.accent,
                } as React.CSSProperties
              }
            >
              <div className="share-card-brand">
                <strong>AKARI</strong>
                <span>HOUSE</span>
              </div>
              <span className="share-card-flower" aria-hidden="true">
                ✦
              </span>
              <div className="share-card-identity">
                <span>
                  {settings.design === "passport"
                    ? "Member passport"
                    : "Member signature"}
                </span>
                <h2>{loaderData.profile.displayName}</h2>
                <p>@{loaderData.user.username}</p>
                <strong>{title}</strong>
              </div>
              <div className="share-card-metrics">
                <div>
                  <strong>{loaderData.opportunityStats.created}</strong>
                  <span>Created</span>
                </div>
                <div>
                  <strong>{loaderData.opportunityStats.received}</strong>
                  <span>Received</span>
                </div>
                <div>
                  <strong>
                    {loaderData.percentile.topPercent
                      ? `Top ${loaderData.percentile.topPercent}%`
                      : "Building"}
                  </strong>
                  <span>
                    {loaderData.percentile.confidence === "verified"
                      ? "Verified percentile"
                      : "AKARI percentile"}
                  </span>
                </div>
              </div>
              <footer>
                <span>{location}</span>
                {languages && <span>{languages}</span>}
                <span>
                  {loaderData.socials
                    .map((social) =>
                      social.platform === "x"
                        ? "X"
                        : social.platform[0].toUpperCase(),
                    )
                    .join(" · ")}
                </span>
              </footer>
            </article>
            <p className="share-card-confidence">
              {loaderData.percentile.confidence === "verified"
                ? "Percentile uses verified member signals."
                : loaderData.percentile.confidence === "provisional"
                  ? "Provisional percentile: one or more signals are member-reported."
                  : "Your percentile appears after enough comparable member signals exist."}
            </p>
          </section>

          <Form method="post" className="share-card-controls">
            <fieldset>
              <legend>Card design</legend>
              <label>
                <input
                  type="radio"
                  name="design"
                  value="signature"
                  checked={settings.design === "signature"}
                  onChange={() =>
                    setSettings({ ...settings, design: "signature" })
                  }
                />{" "}
                Signature
              </label>
              <label>
                <input
                  type="radio"
                  name="design"
                  value="passport"
                  checked={settings.design === "passport"}
                  onChange={() =>
                    setSettings({ ...settings, design: "passport" })
                  }
                />{" "}
                Passport
              </label>
            </fieldset>
            <fieldset>
              <legend>Format</legend>
              <label>
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={settings.orientation === "landscape"}
                  onChange={() =>
                    setSettings({ ...settings, orientation: "landscape" })
                  }
                />{" "}
                Landscape
              </label>
              <label>
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={settings.orientation === "portrait"}
                  onChange={() =>
                    setSettings({ ...settings, orientation: "portrait" })
                  }
                />{" "}
                Portrait
              </label>
            </fieldset>
            <label>
              AKARI palette
              <select
                name="palette"
                value={settings.palette}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    palette: event.target.value as keyof typeof palettes,
                  })
                }
              >
                {Object.entries(palettes).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Country code
              <input
                name="countryCode"
                maxLength={2}
                placeholder="DE"
                value={settings.countryCode}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    countryCode: event.target.value.toUpperCase(),
                  })
                }
              />
            </label>
            <label className="share-card-check">
              <input
                type="checkbox"
                name="showLocation"
                checked={Boolean(settings.showLocation)}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    showLocation: event.target.checked ? 1 : 0,
                  })
                }
              />{" "}
              Show country and flag
            </label>
            <label>
              Languages
              <input
                name="languages"
                maxLength={160}
                placeholder="English, German"
                value={languages}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    languagesJson: JSON.stringify(
                      event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    ),
                  })
                }
              />
            </label>
            <button
              className="button button-secondary"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state === "idle" ? "Save preferences" : "Saving…"}
            </button>
            <div className="share-card-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={download}
              >
                Download PNG
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void share()}
              >
                Share card
              </button>
            </div>
            <small>
              Sharing always uses your public profile link. Hidden location
              never appears on the card.
            </small>
          </Form>
        </div>
      </main>
    </div>
  );
}
