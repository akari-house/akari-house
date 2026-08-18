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
import "~/styles/profile-card-glass.css";
import "~/styles/profile-card-r82.css";

type PaletteConfig = {
  label: string;
  description: string;
  background: string;
  ink: string;
  accent: string;
  highlight: string;
  surface: string;
  shadow: string;
};

const palettes: Record<ProfileCardPalette, PaletteConfig> = {
  midnight: {
    label: "Midnight Glass",
    description: "Near-black glass with AKARI pink and blossom yellow light.",
    background: "#070a12",
    ink: "#fffaf7",
    accent: "#f04f87",
    highlight: "#ffd33d",
    surface: "rgba(255,255,255,0.075)",
    shadow: "rgba(0,0,0,0.72)",
  },
  pearl: {
    label: "Pearl Glass",
    description: "Warm pearl glass with soft pink and yellow highlights.",
    background: "#fff5ee",
    ink: "#2b1720",
    accent: "#f04f87",
    highlight: "#e9b900",
    surface: "rgba(255,255,255,0.58)",
    shadow: "rgba(82,31,51,0.22)",
  },
  sakura: {
    label: "Sakura Glass",
    description: "AKARI pink glass with a darker professional foundation.",
    background: "#431225",
    ink: "#fff8f7",
    accent: "#ff6a9f",
    highlight: "#ffd33d",
    surface: "rgba(255,255,255,0.08)",
    shadow: "rgba(31,4,17,0.68)",
  },
  blossom: {
    label: "Blossom Plum",
    description: "Deep blossom glass for a richer pink-led identity.",
    background: "#210914",
    ink: "#fff8fa",
    accent: "#f04f87",
    highlight: "#ffd33d",
    surface: "rgba(240,79,135,0.09)",
    shadow: "rgba(19,3,11,0.72)",
  },
  lantern: {
    label: "Lantern Gold",
    description: "Blossom yellow glass with pink AKARI accents.",
    background: "#f6ca37",
    ink: "#21151b",
    accent: "#e63f78",
    highlight: "#fff8df",
    surface: "rgba(255,255,255,0.24)",
    shadow: "rgba(97,62,0,0.24)",
  },
};

const socialLabels: Record<ProfileCardSocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  telegram: "Telegram",
  website: "Website",
};

function titleCaseRole(role: string) {
  return role
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function flagFor(countryCode: string) {
  if (!/^[A-Z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(
    ...countryCode.split("").map((character) => 127397 + character.charCodeAt(0)),
  );
}

function avatarUrl(model: ProfileCardModel) {
  return `/media/profile/${encodeURIComponent(model.username)}`;
}

function SocialIcon({ platform }: { platform: ProfileCardSocialPlatform }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (platform) {
    case "x":
      return (
        <svg {...common}>
          <path d="M5 4l14 16M19 4L5 20" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...common}>
          <rect x="4" y="9" width="4" height="11" rx="1" />
          <path d="M6 4.7v.1M11 20V9h4v2c1-1.7 5-2.1 5 2.8V20" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <path d="M4 7.5c0-1.4 1.1-2.5 2.5-2.5h11C18.9 5 20 6.1 20 7.5v9c0 1.4-1.1 2.5-2.5 2.5h-11A2.5 2.5 0 014 16.5v-9z" />
          <path d="M10 9l5 3-5 3V9z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M17.4 6.6h.1" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 4v10.3a4.3 4.3 0 11-3.2-4.2" />
          <path d="M14 4c.6 2.8 2.3 4.3 5 4.6" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common}>
          <path d="M14 20v-7h3l.5-3H14V8.5c0-1 .4-1.5 1.7-1.5H18V4.3c-.7-.2-1.7-.3-2.8-.3C12.4 4 11 5.7 11 8.3V10H8v3h3v7" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <path d="M4 11.4L20 5l-3 14-5.5-4-3 2.4.8-5.2L17 7.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8S14.2 17.7 12 20M12 4C9.8 6.3 8.7 9 8.7 12S9.8 17.7 12 20" />
        </svg>
      );
  }
}

function LinkGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 13.5l3-3" />
      <path d="M8.2 15.8l-1.4 1.4a3.5 3.5 0 01-5-5l3.5-3.5a3.5 3.5 0 014.9 0" />
      <path d="M15.8 8.2l1.4-1.4a3.5 3.5 0 015 5l-3.5 3.5a3.5 3.5 0 01-4.9 0" />
    </svg>
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

function drawSocialMark(
  ctx: CanvasRenderingContext2D,
  platform: ProfileCardSocialPlatform,
  x: number,
  y: number,
  ink: string,
) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (platform === "x") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 24, y + 24);
    ctx.moveTo(x + 24, y);
    ctx.lineTo(x, y + 24);
    ctx.stroke();
  } else if (platform === "youtube") {
    roundedRect(ctx, x, y + 3, 28, 20, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 8);
    ctx.lineTo(x + 20, y + 13);
    ctx.lineTo(x + 11, y + 18);
    ctx.closePath();
    ctx.fill();
  } else if (platform === "linkedin") {
    ctx.font = "700 23px Inter, sans-serif";
    ctx.fillText("in", x + 1, y + 22);
  } else if (platform === "instagram") {
    roundedRect(ctx, x, y, 25, 25, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 12.5, y + 12.5, 5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (platform === "telegram") {
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x + 27, y);
    ctx.lineTo(x + 21, y + 25);
    ctx.lineTo(x + 12, y + 17);
    ctx.closePath();
    ctx.stroke();
  } else if (platform === "tiktok") {
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 2);
    ctx.lineTo(x + 16, y + 17);
    ctx.arc(x + 10, y + 17, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (platform === "facebook") {
    ctx.font = "800 27px Inter, sans-serif";
    ctx.fillText("f", x + 8, y + 24);
  } else {
    ctx.beginPath();
    ctx.arc(x + 13, y + 13, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 13);
    ctx.lineTo(x + 24, y + 13);
    ctx.stroke();
  }
  ctx.restore();
}

async function drawCard(
  canvas: HTMLCanvasElement,
  model: ProfileCardModel,
  settings: ProfileCardSettings,
) {
  canvas.width = 1600;
  canvas.height = 1008;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = palettes[settings.palette];
  const languages = parseProfileCardLanguages(settings.languagesJson);
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => titleCaseRole(state.role));
  const canonicalUrl = `akarihouse.com/profiles/${model.username}`;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, `${palette.highlight}1f`);
  gradient.addColorStop(0.44, `${palette.ink}09`);
  gradient.addColorStop(1, `${palette.accent}2d`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  roundedRect(ctx, 45, 45, 1510, 918, 62);
  ctx.strokeStyle = `${palette.ink}62`;
  ctx.lineWidth = 2;
  ctx.stroke();
  roundedRect(ctx, 61, 61, 1478, 886, 52);
  ctx.strokeStyle = `${palette.accent}49`;
  ctx.stroke();

  try {
    const watermark = await loadImage("/assets/brand/akari-flower-mark.png");
    ctx.globalAlpha = 0.08;
    ctx.drawImage(watermark, 1110, 620, 430, 430);
    ctx.globalAlpha = 1;
  } catch {
    // Decorative watermark is optional if decoding fails.
  }

  try {
    const logo = await loadImage("/assets/brand/akari-logo-horizontal.png");
    ctx.drawImage(logo, 1080, 95, 350, 96);
    ctx.fillStyle = palette.accent;
    ctx.font = "900 25px Inter, sans-serif";
    ctx.fillText("HOUSE", 1432, 157);
  } catch {
    ctx.fillStyle = palette.ink;
    ctx.font = "800 48px Inter, sans-serif";
    ctx.fillText("AKARI HOUSE", 1080, 155);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(288, 354, 170, 0, Math.PI * 2);
  ctx.clip();
  if (model.avatarKey) {
    try {
      const avatar = await loadImage(avatarUrl(model));
      ctx.drawImage(avatar, 118, 184, 340, 340);
    } catch {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(118, 184, 340, 340);
      ctx.fillStyle = palette.background;
      ctx.font = "800 100px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(profileCardInitials(model.displayName), 288, 390);
      ctx.textAlign = "left";
    }
  } else {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(118, 184, 340, 340);
    ctx.fillStyle = palette.background;
    ctx.font = "800 100px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(profileCardInitials(model.displayName), 288, 390);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(288, 354, 178, 0, Math.PI * 2);
  ctx.strokeStyle = `${palette.accent}dd`;
  ctx.lineWidth = 12;
  ctx.stroke();
  try {
    const flower = await loadImage("/assets/brand/akari-flower-mark.png");
    ctx.beginPath();
    ctx.arc(410, 474, 48, 0, Math.PI * 2);
    ctx.fillStyle = palette.background;
    ctx.fill();
    ctx.strokeStyle = `${palette.ink}55`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(flower, 380, 444, 60, 60);
  } catch {
    // Avatar brand seal is optional if decoding fails.
  }

  const identityX = 520;
  ctx.fillStyle = palette.ink;
  ctx.font = "800 72px Inter, sans-serif";
  ctx.fillText(model.displayName.slice(0, 24), identityX, 325);
  ctx.font = "500 30px Inter, sans-serif";
  ctx.globalAlpha = 0.72;
  ctx.fillText(`@${model.username}`, identityX, 374);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.highlight;
  ctx.font = "650 31px Inter, sans-serif";
  ctx.fillText(
    model.roles.map(titleCaseRole).join(" · ").slice(0, 48) || "AKARI Member",
    identityX,
    430,
  );
  if (model.headline) {
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.8;
    ctx.font = "500 23px Inter, sans-serif";
    ctx.fillText(model.headline.slice(0, 62), identityX, 478);
    ctx.globalAlpha = 1;
  }

  let pillX = identityX;
  model.roles.slice(0, 3).forEach((role) => {
    const label = titleCaseRole(role);
    ctx.font = "650 18px Inter, sans-serif";
    const width = Math.max(104, ctx.measureText(label).width + 44);
    roundedRect(ctx, pillX, 515, width, 46, 23);
    ctx.fillStyle = `${palette.ink}0d`;
    ctx.fill();
    ctx.strokeStyle = `${palette.accent}70`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    ctx.fillText(label, pillX + 22, 545);
    pillX += width + 14;
  });

  roundedRect(ctx, 520, 665, 790, 110, 30);
  ctx.fillStyle = `${palette.ink}0a`;
  ctx.fill();
  ctx.strokeStyle = `${palette.ink}28`;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "600 21px Inter, sans-serif";
  ctx.fillText("Connect with me", 565, 730);
  const visibleSocials = model.socials.slice(0, 6);
  visibleSocials.forEach((social, index) => {
    const circleX = 805 + index * 72;
    ctx.beginPath();
    ctx.arc(circleX, 720, 26, 0, Math.PI * 2);
    ctx.strokeStyle = `${palette.ink}3c`;
    ctx.stroke();
    drawSocialMark(ctx, social.platform, circleX - 12, 708, palette.ink);
  });

  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.62;
  ctx.font = "500 17px Inter, sans-serif";
  ctx.fillText(canonicalUrl, 118, 905);
  ctx.textAlign = "right";
  ctx.fillText("A private ecosystem for high-signal connections.", 1480, 905);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  void languages;
  void verifiedRoles;
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
  const [settings, setSettings] = useState<ProfileCardSettings>({
    ...model.settings,
    orientation: "landscape",
  });
  const [languageToAdd, setLanguageToAdd] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const languages = useMemo(
    () => parseProfileCardLanguages(settings.languagesJson),
    [settings.languagesJson],
  );
  const palette = palettes[settings.palette];
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => titleCaseRole(state.role));
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
  const opportunities =
    model.opportunityStats.created + model.opportunityStats.received;

  function updateLanguages(next: string[]) {
    setSettings({ ...settings, languagesJson: JSON.stringify(next) });
  }

  function addLanguage() {
    if (!languageToAdd || languages.length >= MAX_PROFILE_CARD_LANGUAGES)
      return;
    updateLanguages([...languages, languageToAdd]);
    setLanguageToAdd("");
  }

  async function download() {
    const canvas = document.createElement("canvas");
    await drawCard(canvas, model, settings);
    const link = document.createElement("a");
    link.download = `akari-${model.username}-profile-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setShareStatus("Profile card downloaded.");
  }

  async function share() {
    const canvas = document.createElement("canvas");
    await drawCard(canvas, model, settings);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], `akari-${model.username}-profile-card.png`, {
      type: "image/png",
    });
    const publicUrl = canSharePublicProfile
      ? `${window.location.origin}/profiles/${model.username}`
      : window.location.origin;

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${model.displayName} on AKARI House`,
          text: "Connect with me on AKARI House.",
          url: publicUrl,
          files: [file],
        });
        setShareStatus("Share sheet opened.");
      } else {
        await navigator.clipboard.writeText(publicUrl);
        setShareStatus("Profile link copied.");
      }
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      )
        return;
      setShareStatus("Sharing was unavailable. Download the card instead.");
    }
  }

  const cardStyle = {
    "--card-bg": palette.background,
    "--card-ink": palette.ink,
    "--card-accent": palette.accent,
    "--card-highlight": palette.highlight,
    "--card-surface": palette.surface,
    "--card-shadow": palette.shadow,
  } as CSSProperties;

  return (
    <main id="main-content" className="share-card-main glass-share-page">
      <header className="share-card-heading">
        <div>
          <span className="eyebrow">Your AKARI identity</span>
          <h1>Profile sharing card</h1>
          <p>
            A compact AKARI identity card built from your real member data.
            Choose your glass color, control private details, then download or
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
        <section
          className="share-card-stage glass-card-stage"
          aria-label="Card preview"
        >
          <article
            className={`akari-share-card glass-profile-card landscape ${settings.design} palette-${settings.palette}`}
            style={cardStyle}
          >
            <div className="glass-card-gloss" aria-hidden="true" />
            <img
              className="glass-card-watermark"
              src="/assets/brand/akari-flower-mark.png"
              alt=""
              aria-hidden="true"
            />

            <div className="glass-card-topline">
              <div className="glass-card-brand">
                <img
                  src="/assets/brand/akari-logo-horizontal.png"
                  alt="AKARI"
                />
                <span>HOUSE</span>
              </div>
              <span className="glass-card-edition">
                {settings.design === "passport"
                  ? "Member passport"
                  : "Profile signature"}
              </span>
            </div>

            <div className="glass-card-core">
              <div className="profile-card-person glass-card-person">
                <div className="profile-card-avatar glass-card-avatar">
                  {model.avatarKey ? (
                    <img
                      src={avatarUrl(model)}
                      alt={`${model.displayName}'s profile`}
                      width={180}
                      height={180}
                    />
                  ) : (
                    <span aria-hidden="true">
                      {profileCardInitials(model.displayName)}
                    </span>
                  )}
                  <span className="glass-avatar-seal" aria-hidden="true">
                    <img src="/assets/brand/akari-flower-mark.png" alt="" />
                  </span>
                </div>
              </div>

              <div className="share-card-identity glass-card-identity">
                <h2>{model.displayName}</h2>
                <p className="glass-card-handle">@{model.username}</p>
                <strong className="glass-role-line">
                  {model.roles.length
                    ? model.roles.map(titleCaseRole).join(" · ")
                    : "AKARI Member"}
                </strong>
                {model.headline && (
                  <p className="profile-card-headline glass-card-headline">
                    {model.headline}
                  </p>
                )}
                <span className="share-card-verification glass-card-verification">
                  {verifiedRoles.length
                    ? `AKARI verified · ${verifiedRoles.join(" · ")}`
                    : "AKARI member"}
                </span>
                <div className="glass-role-pills" aria-label="AKARI roles">
                  {model.roles.slice(0, 3).map((role) => (
                    <span key={role}>{titleCaseRole(role)}</span>
                  ))}
                </div>
              </div>

              <div className="glass-profile-link" aria-label="Profile link">
                <span className="glass-profile-link-icon">
                  <LinkGlyph size={22} />
                </span>
                <small>Profile link</small>
                <strong>Connect on AKARI</strong>
                <span>{canonicalUrl}</span>
              </div>
            </div>

            <div className="share-card-metrics glass-card-metrics">
              <div>
                <strong>{opportunities}</strong>
                <span>Opportunities</span>
              </div>
              <div>
                <strong>{formatProfileReach(model.followerCount)}</strong>
                <span>Reach</span>
              </div>
              <div>
                <strong>
                  {model.percentile.topPercent
                    ? `Top ${model.percentile.topPercent}%`
                    : "Building"}
                </strong>
                <span>AKARI signal</span>
              </div>
            </div>

            <div className="glass-connect-strip">
              <strong>Connect with me</strong>
              <div
                className="profile-card-socials glass-card-socials"
                aria-label="Connected social platforms"
              >
                {model.socials.length ? (
                  model.socials.map((social) => (
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
                  ))
                ) : (
                  <span className="glass-no-socials">
                    Add social links to your profile
                  </span>
                )}
              </div>
            </div>

            <footer className="profile-card-footer glass-card-footer">
              <div className="profile-card-private-details">
                <span>{location}</span>
                {settings.showLanguages && languages.length > 0 && (
                  <span>{languages.join(" · ")}</span>
                )}
              </div>
              <span className="glass-card-footer-brand">akarihouse.com</span>
            </footer>
          </article>

          <div className="glass-card-note">
            <strong>Credit-card format</strong>
            <span>
              85.6 × 53.98 proportion. The downloaded PNG uses the same compact
              identity hierarchy.
            </span>
          </div>
          <p className="share-card-confidence">
            {model.percentile.confidence === "verified"
              ? "Percentile uses verified member signals."
              : model.percentile.confidence === "provisional"
                ? "Provisional percentile: one or more signals are member-reported."
                : "Your percentile appears after enough comparable member signals exist."}
          </p>
        </section>

        <Form method="post" className="share-card-controls glass-card-controls">
          <input type="hidden" name="orientation" value="landscape" />

          <fieldset>
            <legend>Card detail</legend>
            <label>
              <input
                type="radio"
                name="design"
                value="signature"
                checked={settings.design === "signature"}
                onChange={() =>
                  setSettings({ ...settings, design: "signature" })
                }
              />
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
              />
              Passport
            </label>
          </fieldset>

          <fieldset className="glass-palette-fieldset">
            <legend>Glass color</legend>
            <div className="glass-palette-grid">
              {Object.entries(palettes).map(([value, item]) => (
                <label
                  className={`glass-palette-choice ${settings.palette === value ? "is-selected" : ""}`}
                  key={value}
                >
                  <input
                    type="radio"
                    name="palette"
                    value={value}
                    checked={settings.palette === value}
                    onChange={() =>
                      setSettings({
                        ...settings,
                        palette: value as ProfileCardPalette,
                      })
                    }
                  />
                  <span
                    className="glass-palette-swatch"
                    style={
                      {
                        "--swatch-bg": item.background,
                        "--swatch-accent": item.accent,
                        "--swatch-highlight": item.highlight,
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="switch-row">
            <span>
              <strong>Show location</strong>
              <small>{location}</small>
            </span>
            <input
              type="checkbox"
              name="showLocation"
              checked={settings.showLocation}
              onChange={(event) =>
                setSettings({ ...settings, showLocation: event.target.checked })
              }
            />
          </label>

          <label>
            Country code for flag
            <input
              name="countryCode"
              maxLength={2}
              value={settings.countryCode}
              placeholder="DE"
              onChange={(event) =>
                setSettings({
                  ...settings,
                  countryCode: event.target.value.toUpperCase(),
                })
              }
            />
          </label>

          <label className="switch-row">
            <span>
              <strong>Show languages</strong>
              <small>Choose up to {MAX_PROFILE_CARD_LANGUAGES}.</small>
            </span>
            <input
              type="checkbox"
              name="showLanguages"
              checked={settings.showLanguages}
              onChange={(event) =>
                setSettings({ ...settings, showLanguages: event.target.checked })
              }
            />
          </label>

          <div className="profile-card-language-control">
            <span>Languages</span>
            <div className="profile-card-language-add">
              <select
                value={languageToAdd}
                aria-label="Language to add"
                disabled={languages.length >= MAX_PROFILE_CARD_LANGUAGES}
                onChange={(event) => setLanguageToAdd(event.target.value)}
              >
                <option value="">Choose a language</option>
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
              <button
                className="button button-quiet"
                type="button"
                disabled={
                  !languageToAdd || languages.length >= MAX_PROFILE_CARD_LANGUAGES
                }
                onClick={addLanguage}
              >
                Add
              </button>
            </div>
            <div
              className="profile-card-language-tags"
              aria-label="Selected languages"
            >
              {languages.map((language) => (
                <span className="profile-card-language-tag" key={language}>
                  {language}
                  <button
                    type="button"
                    aria-label={`Remove ${language}`}
                    onClick={() =>
                      updateLanguages(
                        languages.filter((candidate) => candidate !== language),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <input
            type="hidden"
            name="languagesJson"
            value={JSON.stringify(languages)}
          />
          <div className="share-card-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state !== "idle" ? "Saving…" : "Save preferences"}
            </button>
            <button className="button button-quiet" type="button" onClick={download}>
              Download PNG
            </button>
            <button className="button button-quiet" type="button" onClick={share}>
              Share card
            </button>
          </div>
          {shareStatus && <small role="status">{shareStatus}</small>}
        </Form>
      </div>
    </main>
  );
}
