import { useMemo, useState, type CSSProperties } from "react";
import { Form, Link, useNavigation } from "react-router";
import {
  MAX_PROFILE_CARD_LANGUAGES,
  PROFILE_CARD_LANGUAGE_OPTIONS,
  formatProfileReach,
  parseProfileCardLanguages,
  profileCardInitials,
  type ProfileCardModel,
  type ProfileCardPalette,
  type ProfileCardSettings,
  type ProfileCardSocialPlatform,
} from "~/lib/profile-card";
import "~/styles/profile-card-enhancements.css";

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

const socialLabels: Record<ProfileCardSocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

function flagFor(code: string) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(
        ...[...code].map((letter) => 127397 + letter.charCodeAt(0)),
      )
    : "";
}

function SocialIcon({ platform }: { platform: ProfileCardSocialPlatform }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (platform === "x") {
    return (
      <svg {...common}>
        <path d="M5 4l14 16M19 4L5 20" />
      </svg>
    );
  }
  if (platform === "linkedin") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 10v7M8 7.3v.2M12 17v-4.1c0-1.7 1-2.9 2.6-2.9 1.5 0 2.4 1 2.4 2.9V17M12 10v7" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.4" cy="6.7" r=".7" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg {...common}>
        <path d="M21 12c0 3.1-.4 5-1.2 5.8C19 18.6 16.4 19 12 19s-7-.4-7.8-1.2C3.4 17 3 15.1 3 12s.4-5 1.2-5.8C5 5.4 7.6 5 12 5s7 .4 7.8 1.2C20.6 7 21 8.9 21 12z" />
        <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M13.5 20v-7h2.5l.4-3h-2.9V8.1c0-.9.3-1.5 1.6-1.5H17V4a23 23 0 00-2.4-.1c-2.4 0-4.1 1.5-4.1 4.2V10H8v3h2.5v7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14.5 4v9.2a3.8 3.8 0 11-3.2-3.8" />
      <path d="M14.5 4c.8 2.6 2.4 4 5 4.3" />
    </svg>
  );
}

function avatarUrl(model: ProfileCardModel) {
  return model.avatarKey
    ? `/media/profile/${encodeURIComponent(model.username)}?v=${encodeURIComponent(model.avatarKey)}`
    : "";
}

async function loadImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

function drawSocialMark(
  ctx: CanvasRenderingContext2D,
  platform: ProfileCardSocialPlatform,
  x: number,
  y: number,
  colour: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (platform === "x") {
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(22, 22);
    ctx.moveTo(22, 2);
    ctx.lineTo(2, 22);
    ctx.stroke();
  } else if (platform === "instagram") {
    ctx.strokeRect(2, 2, 20, 20);
    ctx.beginPath();
    ctx.arc(12, 12, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(18, 6, 1.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (platform === "youtube") {
    ctx.strokeRect(1, 4, 22, 16);
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.lineTo(17, 12);
    ctx.lineTo(10, 16);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = "700 20px Inter, sans-serif";
    ctx.fillText(
      platform === "linkedin"
        ? "in"
        : platform === "facebook"
          ? "f"
          : "♪",
      2,
      20,
    );
  }
  ctx.restore();
}

async function drawCard(
  canvas: HTMLCanvasElement,
  model: ProfileCardModel,
  settings: ProfileCardSettings,
) {
  const portrait = settings.orientation === "portrait";
  canvas.width = portrait ? 1080 : 1600;
  canvas.height = portrait ? 1350 : 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = palettes[settings.palette];
  const languages = settings.showLanguages
    ? parseProfileCardLanguages(settings.languagesJson)
    : [];
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => state.role[0]?.toUpperCase() + state.role.slice(1));
  const opportunities = model.opportunityStats.created + model.opportunityStats.received;

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

  const photoSize = portrait ? 190 : 180;
  const photoX = 90;
  const photoY = portrait ? 220 : 245;
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    photoX + photoSize / 2,
    photoY + photoSize / 2,
    photoSize / 2,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  const imageUrl = avatarUrl(model);
  if (imageUrl) {
    try {
      const photo = await loadImage(imageUrl);
      ctx.drawImage(photo, photoX, photoY, photoSize, photoSize);
    } catch {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }
  } else {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
  }
  ctx.restore();
  if (!imageUrl) {
    ctx.fillStyle = palette.background;
    ctx.font = `700 ${portrait ? 70 : 64}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      profileCardInitials(model.displayName),
      photoX + photoSize / 2,
      photoY + photoSize / 2 + 24,
    );
    ctx.textAlign = "left";
  }

  const identityX = portrait ? 90 : 310;
  const identityY = portrait ? 500 : 320;
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${portrait ? 68 : 72}px Inter, sans-serif`;
  ctx.fillText(model.displayName.slice(0, 24), identityX, identityY);
  ctx.font = "500 29px Inter, sans-serif";
  ctx.fillText(`@${model.username}`, identityX, identityY + 46);
  if (model.headline) {
    ctx.font = "500 25px Inter, sans-serif";
    ctx.fillText(model.headline.slice(0, portrait ? 48 : 62), identityX, identityY + 88);
  }
  ctx.font = "600 25px Inter, sans-serif";
  ctx.fillText(
    model.roles.map((role) => role[0]?.toUpperCase() + role.slice(1)).join(" · "),
    identityX,
    identityY + 130,
  );
  ctx.fillStyle = palette.accent;
  ctx.font = "700 22px Inter, sans-serif";
  ctx.fillText(
    verifiedRoles.length
      ? `ADMIN VERIFIED · ${verifiedRoles.join(" · ")}`
      : "NOT YET ADMIN VERIFIED",
    identityX,
    identityY + 170,
  );

  const metricsY = portrait ? 930 : 720;
  const metricWidth = (canvas.width - 180) / 3;
  const metricValues = [
    [String(opportunities), "OPPORTUNITIES"],
    [formatProfileReach(model.followerCount), "REACH"],
    [model.percentile.topPercent ? `TOP ${model.percentile.topPercent}%` : "BUILDING", "PERCENTILE"],
  ];
  ctx.strokeStyle = palette.ink + "33";
  ctx.beginPath();
  ctx.moveTo(90, metricsY - 40);
  ctx.lineTo(canvas.width - 90, metricsY - 40);
  ctx.moveTo(90, metricsY + 95);
  ctx.lineTo(canvas.width - 90, metricsY + 95);
  ctx.stroke();
  metricValues.forEach(([value, label], index) => {
    const x = 90 + index * metricWidth;
    ctx.fillStyle = palette.accent;
    ctx.font = "700 38px Inter, sans-serif";
    ctx.fillText(value, x, metricsY + 18);
    ctx.fillStyle = palette.ink;
    ctx.font = "700 18px Inter, sans-serif";
    ctx.fillText(label, x, metricsY + 58);
  });

  const footerY = portrait ? 1195 : 890;
  ctx.fillStyle = palette.ink;
  ctx.font = "500 20px Inter, sans-serif";
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "Location private";
  ctx.fillText(location, 90, footerY);
  if (languages.length) {
    ctx.fillText(`Languages · ${languages.join(" · ")}`, 90, footerY + 35);
  }
  model.socials.forEach((social, index) =>
    drawSocialMark(ctx, social.platform, 90 + index * 40, footerY + 58, palette.ink),
  );
  ctx.textAlign = "right";
  ctx.font = "600 19px Inter, sans-serif";
  ctx.fillText(
    model.accessTier === "member" && model.visibility === "public"
      ? `akarihouse.com/profiles/${model.username}`
      : "Private AKARI profile",
    canvas.width - 90,
    footerY + 78,
  );
  ctx.textAlign = "left";

  try {
    const flower = await loadImage("/assets/brand/akari-flower-mark.png");
    ctx.drawImage(flower, canvas.width - 220, 62, 130, 130);
  } catch {
    // The AKARI wordmark remains present if the flower cannot be decoded.
  }
}

export function ProfileShareCard({
  model,
  saved,
  error,
}: {
  model: ProfileCardModel;
  saved: boolean;
  error?: string;
}) {
  const navigation = useNavigation();
  const [settings, setSettings] = useState<ProfileCardSettings>(model.settings);
  const [languageToAdd, setLanguageToAdd] = useState("");
  const languages = useMemo(
    () => parseProfileCardLanguages(settings.languagesJson),
    [settings.languagesJson],
  );
  const palette = palettes[settings.palette];
  const roles = model.roles
    .map((role) => role[0]?.toUpperCase() + role.slice(1))
    .join(" · ");
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => state.role);
  const canSharePublicProfile =
    model.accessTier === "member" && model.visibility === "public";
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "Location private";
  const canonicalUrl = canSharePublicProfile
    ? `akarihouse.com/profiles/${model.username}`
    : "Private AKARI profile";
  const availableLanguages = PROFILE_CARD_LANGUAGE_OPTIONS.filter(
    (language) =>
      !languages.some(
        (selected) =>
          selected.toLocaleLowerCase("en") === language.toLocaleLowerCase("en"),
      ),
  );

  function updateLanguages(next: string[]) {
    setSettings({ ...settings, languagesJson: JSON.stringify(next) });
  }

  function addLanguage() {
    if (!languageToAdd || languages.length >= MAX_PROFILE_CARD_LANGUAGES) return;
    updateLanguages([...languages, languageToAdd]);
    setLanguageToAdd("");
  }

  async function download() {
    const canvas = document.createElement("canvas");
    await drawCard(canvas, model, settings);
    const link = document.createElement("a");
    link.download = `akari-${model.username}-${settings.orientation}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function share() {
    const canvas = document.createElement("canvas");
    await drawCard(canvas, model, settings);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], `akari-${model.username}.png`, {
      type: "image/png",
    });
    const publicUrl = canSharePublicProfile
      ? `${window.location.origin}/profiles/${model.username}`
      : window.location.origin;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `${model.displayName} on AKARI House`,
        text: "Connect with me on AKARI House.",
        url: publicUrl,
        files: [file],
      });
    } else {
      await navigator.clipboard.writeText(publicUrl);
    }
  }

  return (
    <main id="main-content" className="share-card-main">
      <header className="share-card-heading">
        <div>
          <span className="eyebrow">Your AKARI identity</span>
          <h1>Profile sharing card</h1>
          <p>
            Choose an AKARI style, protect what stays private, then download or
            share.
          </p>
        </div>
        <Link className="quiet-link" to={`/profiles/${model.username}`}>
          {canSharePublicProfile ? "View public profile" : "Preview profile"}
        </Link>
      </header>

      {saved && <p className="success-banner">Card preferences saved.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="share-card-layout">
        <section className="share-card-stage" aria-label="Card preview">
          <article
            className={`akari-share-card ${settings.orientation} ${settings.design}`}
            style={
              {
                "--card-bg": palette.background,
                "--card-ink": palette.ink,
                "--card-accent": palette.accent,
              } as CSSProperties
            }
          >
            <div className="share-card-brand">
              <strong>AKARI</strong>
              <span>HOUSE</span>
            </div>
            <img
              className="share-card-flower"
              src="/assets/brand/akari-flower-mark.png"
              alt=""
            />
            <div className="profile-card-person">
              <div className="profile-card-avatar">
                {model.avatarKey ? (
                  <img
                    src={avatarUrl(model)}
                    alt={`${model.displayName}'s profile`}
                    width={132}
                    height={132}
                  />
                ) : (
                  <span aria-hidden="true">
                    {profileCardInitials(model.displayName)}
                  </span>
                )}
              </div>
              <div className="share-card-identity">
                <span>
                  {settings.design === "passport"
                    ? "Member passport"
                    : "Member signature"}
                </span>
                <h2>{model.displayName}</h2>
                <p>@{model.username}</p>
                {model.headline && (
                  <p className="profile-card-headline">{model.headline}</p>
                )}
                <strong>{roles}</strong>
                <span className="share-card-verification">
                  {verifiedRoles.length
                    ? `Admin verified · ${verifiedRoles.join(" · ")}`
                    : "Not yet Admin verified"}
                </span>
              </div>
            </div>
            <div className="share-card-metrics">
              <div>
                <strong>
                  {model.opportunityStats.created + model.opportunityStats.received}
                </strong>
                <span>Opportunities</span>
                <small>
                  {model.opportunityStats.created} created · {model.opportunityStats.received} received
                </small>
              </div>
              <div>
                <strong>{formatProfileReach(model.followerCount)}</strong>
                <span>Reach</span>
                <small>Connected social audience</small>
              </div>
              <div>
                <strong>
                  {model.percentile.topPercent
                    ? `Top ${model.percentile.topPercent}%`
                    : "Building"}
                </strong>
                <span>Percentile</span>
                <small>
                  {model.percentile.confidence === "verified"
                    ? "High confidence"
                    : "AKARI signal"}
                </small>
              </div>
            </div>
            <footer className="profile-card-footer">
              <div className="profile-card-private-details">
                <span>{location}</span>
                {settings.showLanguages && languages.length > 0 && (
                  <span>{languages.join(" · ")}</span>
                )}
              </div>
              <div
                className="profile-card-socials"
                aria-label="Connected social platforms"
              >
                {model.socials.map((social) => (
                  <a
                    key={social.platform}
                    href={social.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={socialLabels[social.platform]}
                    title={socialLabels[social.platform]}
                  >
                    <SocialIcon platform={social.platform} />
                  </a>
                ))}
              </div>
              <span className="profile-card-url">{canonicalUrl}</span>
            </footer>
          </article>
          <p className="share-card-confidence">
            {model.percentile.confidence === "verified"
              ? "Percentile uses verified member signals."
              : model.percentile.confidence === "provisional"
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
                onChange={() => setSettings({ ...settings, design: "signature" })}
              />{" "}
              Signature
            </label>
            <label>
              <input
                type="radio"
                name="design"
                value="passport"
                checked={settings.design === "passport"}
                onChange={() => setSettings({ ...settings, design: "passport" })}
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
                  palette: event.target.value as ProfileCardPalette,
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
          <label className="share-card-check">
            <input
              type="checkbox"
              name="showLanguages"
              checked={Boolean(settings.showLanguages)}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  showLanguages: event.target.checked ? 1 : 0,
                })
              }
            />{" "}
            Show spoken languages
          </label>
          <div className="profile-card-language-control">
            <span>Languages</span>
            <div className="profile-card-language-add">
              <select
                aria-label="Add spoken language"
                value={languageToAdd}
                disabled={languages.length >= MAX_PROFILE_CARD_LANGUAGES}
                onChange={(event) => setLanguageToAdd(event.target.value)}
              >
                <option value="">Select a language</option>
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button-quiet"
                onClick={addLanguage}
                disabled={!languageToAdd || languages.length >= MAX_PROFILE_CARD_LANGUAGES}
              >
                Add
              </button>
            </div>
            <input type="hidden" name="languages" value={languages.join(",")} />
            <div className="profile-card-language-tags" aria-live="polite">
              {languages.map((language) => (
                <span key={language} className="profile-card-language-tag">
                  {language}
                  <button
                    type="button"
                    aria-label={`Remove ${language}`}
                    onClick={() =>
                      updateLanguages(languages.filter((item) => item !== language))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <small>
              {languages.length}/{MAX_PROFILE_CARD_LANGUAGES} languages selected
            </small>
          </div>
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
            Show profile location
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
              onClick={() => void download()}
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
            {canSharePublicProfile
              ? "Sharing uses your canonical public profile URL."
              : "Your profile is not public, so sharing uses the AKARI homepage."}{" "}
            Hidden location and languages never appear on the card.
          </small>
        </Form>
      </div>
    </main>
  );
}
