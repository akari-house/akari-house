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
  type ProfileCardSocial,
  type ProfileCardSocialPlatform,
} from "~/lib/profile-card";
import "~/styles/profile-card-enhancements.css";
import "~/styles/profile-card-approved.css";

type PaletteConfig = {
  label: string;
  tint: string;
  ink: string;
  accent: string;
  highlight: string;
  glass: string;
};

const palettes: Record<ProfileCardPalette, PaletteConfig> = {
  midnight: {
    label: "Midnight Glass",
    tint: "#080b12",
    ink: "#fffaf7",
    accent: "#f04f87",
    highlight: "#ffd33d",
    glass: "rgba(8, 11, 18, 0.48)",
  },
  pearl: {
    label: "Pearl Glass",
    tint: "#e8d8d3",
    ink: "#2c1821",
    accent: "#d93c75",
    highlight: "#b78a00",
    glass: "rgba(255, 246, 242, 0.48)",
  },
  sakura: {
    label: "Sakura Glass",
    tint: "#4a1329",
    ink: "#fffaf9",
    accent: "#ff6a9a",
    highlight: "#ffd33d",
    glass: "rgba(66, 15, 35, 0.44)",
  },
  blossom: {
    label: "Blossom Plum",
    tint: "#220b17",
    ink: "#fff9fb",
    accent: "#f04f87",
    highlight: "#ffd33d",
    glass: "rgba(34, 11, 23, 0.52)",
  },
  lantern: {
    label: "Lantern Gold",
    tint: "#6a4d0c",
    ink: "#fffdf5",
    accent: "#f04f87",
    highlight: "#ffd33d",
    glass: "rgba(75, 52, 5, 0.43)",
  },
};

const socialLabels: Record<ProfileCardSocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

function titleCaseRole(role: string) {
  return role ? role[0].toUpperCase() + role.slice(1) : role;
}

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
    strokeWidth: 1.8,
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

function socialCountLabel(social: ProfileCardSocial) {
  if (social.followerCount == null) return "Connected";
  const count = formatProfileReach(social.followerCount);
  return social.platform === "youtube" ? `${count} subscribers` : `${count} followers`;
}

async function loadImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function drawRoundRect(
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

function drawSocialMark(
  ctx: CanvasRenderingContext2D,
  platform: ProfileCardSocialPlatform,
  x: number,
  y: number,
  colour: string,
) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  if (platform === "x") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 23, y + 23);
    ctx.moveTo(x + 23, y);
    ctx.lineTo(x, y + 23);
    ctx.stroke();
  } else {
    ctx.font = "700 20px Inter, sans-serif";
    const glyph =
      platform === "linkedin"
        ? "in"
        : platform === "instagram"
          ? "IG"
          : platform === "youtube"
            ? "YT"
            : platform === "facebook"
              ? "f"
              : "♪";
    ctx.fillText(glyph, x, y + 20);
  }
  ctx.restore();
}

async function drawCard(
  canvas: HTMLCanvasElement,
  model: ProfileCardModel,
  settings: ProfileCardSettings,
) {
  canvas.width = 1600;
  canvas.height = 1009;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = palettes[settings.palette];
  const languages = settings.showLanguages
    ? parseProfileCardLanguages(settings.languagesJson)
    : [];
  const verified = model.verificationStates.some(
    (state) => state.status === "verified",
  );
  const primarySocial =
    model.socials.find((social) => social.platform === "x") ?? model.socials[0];
  const canonicalUrl =
    model.accessTier === "member" && model.visibility === "public"
      ? `akarihouse.com/profiles/${model.username}`
      : "Private AKARI profile";

  try {
    const scene = await loadImage("/assets/house/arrival-v3.webp");
    drawCoverImage(ctx, scene, canvas.width, canvas.height);
  } catch {
    ctx.fillStyle = palette.tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const tint = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  tint.addColorStop(0, `${palette.tint}88`);
  tint.addColorStop(0.52, `${palette.tint}42`);
  tint.addColorStop(1, `${palette.tint}99`);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.46)";
  ctx.shadowBlur = 48;
  drawRoundRect(ctx, 60, 58, 1480, 893, 64);
  ctx.fillStyle = palette.glass;
  ctx.fill();
  ctx.restore();
  drawRoundRect(ctx, 60, 58, 1480, 893, 64);
  ctx.strokeStyle = "rgba(255,255,255,.42)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const sheen = ctx.createLinearGradient(80, 70, 900, 560);
  sheen.addColorStop(0, "rgba(255,255,255,.22)");
  sheen.addColorStop(0.38, "rgba(255,255,255,.045)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  drawRoundRect(ctx, 61, 59, 1478, 891, 63);
  ctx.fillStyle = sheen;
  ctx.fill();

  try {
    const logo = await loadImage("/assets/brand/akari-logo-horizontal.png");
    const logoWidth = 280;
    const logoHeight = logoWidth * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, 112, 105, logoWidth, logoHeight);
  } catch {
    ctx.fillStyle = palette.accent;
    ctx.font = "800 36px Inter, sans-serif";
    ctx.fillText("AKARI", 112, 155);
  }
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.7;
  ctx.font = "700 18px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("PROFILE CARD", 1475, 142);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  const avatarX = 138;
  const avatarY = 260;
  const avatarSize = 276;
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2 + 10,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  const photoUrl = avatarUrl(model);
  if (photoUrl) {
    try {
      const photo = await loadImage(photoUrl);
      drawCoverImage(ctx, photo, avatarSize, avatarSize);
    } catch {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
  } else {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();
  if (!photoUrl) {
    ctx.fillStyle = palette.ink;
    ctx.font = "800 84px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      profileCardInitials(model.displayName),
      avatarX + avatarSize / 2,
      avatarY + avatarSize / 2 + 28,
    );
    ctx.textAlign = "left";
  }

  const identityX = 480;
  ctx.fillStyle = palette.ink;
  ctx.font = "800 72px Inter, sans-serif";
  ctx.fillText(model.displayName.slice(0, 25), identityX, 340);
  if (verified) {
    ctx.fillStyle = palette.highlight;
    ctx.font = "700 20px Inter, sans-serif";
    ctx.fillText("AKARI VERIFIED", identityX, 386);
  }
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.78;
  ctx.font = "500 29px Inter, sans-serif";
  ctx.fillText(`@${model.username}`, identityX, 428);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.highlight;
  ctx.font = "700 26px Inter, sans-serif";
  ctx.fillText(
    model.roles.map(titleCaseRole).join("  ·  ").slice(0, 54) || "AKARI Member",
    identityX,
    480,
  );
  if (model.headline) {
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.82;
    ctx.font = "500 22px Inter, sans-serif";
    ctx.fillText(model.headline.slice(0, 64), identityX, 528);
    ctx.globalAlpha = 1;
  }

  if (primarySocial) {
    drawRoundRect(ctx, 1134, 258, 338, 268, 38);
    ctx.fillStyle = "rgba(255,255,255,.09)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.24)";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawSocialMark(ctx, primarySocial.platform, 1182, 307, palette.ink);
    ctx.fillStyle = palette.ink;
    ctx.font = "700 18px Inter, sans-serif";
    ctx.fillText(socialLabels[primarySocial.platform].toUpperCase(), 1182, 370);
    ctx.font = "800 38px Inter, sans-serif";
    ctx.fillText(
      primarySocial.followerCount == null
        ? "Connected"
        : formatProfileReach(primarySocial.followerCount),
      1182,
      426,
    );
    ctx.font = "500 18px Inter, sans-serif";
    ctx.globalAlpha = 0.72;
    ctx.fillText(
      primarySocial.platform === "youtube" ? "subscribers" : "followers",
      1182,
      458,
    );
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.moveTo(112, 616);
  ctx.lineTo(1480, 616);
  ctx.strokeStyle = "rgba(255,255,255,.20)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.ink;
  ctx.font = "700 17px Inter, sans-serif";
  ctx.globalAlpha = 0.7;
  ctx.fillText("SOCIAL REACH", 112, 669);
  ctx.globalAlpha = 1;
  model.socials.slice(0, 5).forEach((social, index) => {
    const x = 112 + index * 205;
    drawSocialMark(ctx, social.platform, x, 706, palette.ink);
    ctx.fillStyle = palette.ink;
    ctx.font = "700 17px Inter, sans-serif";
    ctx.fillText(socialLabels[social.platform], x + 38, 724);
    ctx.globalAlpha = 0.72;
    ctx.font = "500 15px Inter, sans-serif";
    ctx.fillText(socialCountLabel(social), x + 38, 750);
    ctx.globalAlpha = 1;
  });

  drawRoundRect(ctx, 112, 800, 530, 92, 24);
  ctx.fillStyle = "rgba(255,255,255,.075)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.font = "700 14px Inter, sans-serif";
  ctx.fillText("AKARI PROFILE ID", 138, 834);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 20px Inter, sans-serif";
  ctx.fillText(`AKARI / @${model.username}`, 138, 866);

  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.72;
  ctx.font = "500 16px Inter, sans-serif";
  ctx.fillText(canonicalUrl, 688, 835);
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "";
  const privacyLine = [location, ...languages.slice(0, 4)].filter(Boolean).join("  ·  ");
  if (privacyLine) ctx.fillText(privacyLine.slice(0, 72), 688, 870);
  ctx.globalAlpha = 1;
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
    design: "signature",
    orientation: "landscape",
  });
  const [languageToAdd, setLanguageToAdd] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const languages = useMemo(
    () => parseProfileCardLanguages(settings.languagesJson),
    [settings.languagesJson],
  );
  const palette = palettes[settings.palette];
  const verified = model.verificationStates.some(
    (state) => state.status === "verified",
  );
  const canSharePublicProfile =
    model.accessTier === "member" && model.visibility === "public";
  const canonicalUrl = canSharePublicProfile
    ? `akarihouse.com/profiles/${model.username}`
    : "Private AKARI profile";
  const primarySocial =
    model.socials.find((social) => social.platform === "x") ?? model.socials[0];
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "";
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
    "--approved-tint": palette.tint,
    "--approved-ink": palette.ink,
    "--approved-accent": palette.accent,
    "--approved-highlight": palette.highlight,
    "--approved-glass": palette.glass,
  } as CSSProperties;

  return (
    <main id="main-content" className="share-card-main approved-share-page">
      <header className="share-card-heading">
        <div>
          <span className="eyebrow">Your AKARI identity</span>
          <h1>Profile sharing card</h1>
          <p>
            One approved glass design. Choose the color, control private details,
            then download or share it.
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

      <div className="share-card-layout approved-share-layout">
        <section className="share-card-stage approved-card-stage" aria-label="Card preview">
          <article
            className={`approved-profile-card glass-profile-card palette-${settings.palette}`}
            style={cardStyle}
          >
            <img
              className="approved-card-scene"
              src="/assets/house/arrival-v3.webp"
              alt=""
              aria-hidden="true"
            />
            <div className="approved-card-tint" aria-hidden="true" />
            <div className="approved-card-glass" aria-hidden="true" />
            <div className="approved-card-content">
              <header className="approved-card-header">
                <div className="approved-card-brand">
                  <img src="/assets/brand/akari-logo-horizontal.png" alt="AKARI" />
                </div>
                <span>Profile card</span>
              </header>

              <div className="approved-card-main">
                <div className="approved-card-avatar-wrap">
                  <div className="approved-card-avatar">
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
                  </div>
                  <span className="approved-avatar-seal" aria-hidden="true">
                    <img src="/assets/brand/akari-flower-mark.png" alt="" />
                  </span>
                </div>

                <div className="approved-card-identity">
                  <div className="approved-name-line">
                    <h2>{model.displayName}</h2>
                    {verified && <span>Verified</span>}
                  </div>
                  <p className="approved-handle">@{model.username}</p>
                  <strong className="approved-role-line">
                    {model.roles.length
                      ? model.roles.map(titleCaseRole).join(" · ")
                      : "AKARI Member"}
                  </strong>
                  {model.headline && <p className="approved-headline">{model.headline}</p>}
                </div>

                {primarySocial && (
                  <a
                    className="approved-primary-social"
                    href={primarySocial.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="approved-social-icon">
                      <SocialIcon platform={primarySocial.platform} />
                    </span>
                    <small>{socialLabels[primarySocial.platform]}</small>
                    <strong>
                      {primarySocial.followerCount == null
                        ? "Connected"
                        : formatProfileReach(primarySocial.followerCount)}
                    </strong>
                    <span>
                      {primarySocial.platform === "youtube"
                        ? "subscribers"
                        : primarySocial.followerCount == null
                          ? "profile linked"
                          : "followers"}
                    </span>
                  </a>
                )}
              </div>

              <div className="approved-card-social-row" aria-label="Connected social accounts">
                {model.socials.length ? (
                  model.socials.slice(0, 5).map((social) => (
                    <a
                      key={social.platform}
                      href={social.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`${socialLabels[social.platform]}: ${socialCountLabel(social)}`}
                    >
                      <SocialIcon platform={social.platform} />
                      <span>
                        <strong>{socialLabels[social.platform]}</strong>
                        <small>{socialCountLabel(social)}</small>
                      </span>
                    </a>
                  ))
                ) : (
                  <span className="approved-no-socials">
                    Add social profiles to show your network reach here.
                  </span>
                )}
              </div>

              <footer className="approved-card-footer">
                <div className="approved-profile-id">
                  <small>AKARI profile ID</small>
                  <strong>AKARI / @{model.username}</strong>
                </div>
                <div className="approved-card-meta">
                  <span>{canonicalUrl}</span>
                  {(location || (settings.showLanguages && languages.length > 0)) && (
                    <small>
                      {[location, ...(settings.showLanguages ? languages.slice(0, 4) : [])]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                </div>
              </footer>
            </div>
          </article>
          <p className="approved-card-caption">
            Transparent frosted glass. The official AKARI scene stays visible through the card.
          </p>
        </section>

        <Form method="post" className="share-card-controls approved-card-controls">
          <input type="hidden" name="design" value="signature" />
          <input type="hidden" name="orientation" value="landscape" />

          <fieldset className="approved-palette-fieldset">
            <legend>Card color</legend>
            <div className="approved-palette-grid">
              {Object.entries(palettes).map(([value, item]) => (
                <label
                  key={value}
                  className={`approved-palette-choice ${settings.palette === value ? "is-selected" : ""}`}
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
                    className="approved-palette-swatch"
                    style={
                      {
                        "--swatch-tint": item.tint,
                        "--swatch-accent": item.accent,
                      } as CSSProperties
                    }
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
            />
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
            />
            Show profile location
          </label>

          <button
            className="button button-secondary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "idle" ? "Save preferences" : "Saving..."}
          </button>

          <div className="share-card-actions">
            <button type="button" className="button button-quiet" onClick={download}>
              Download PNG
            </button>
            <button type="button" className="button button-primary" onClick={share}>
              Share card
            </button>
          </div>

          {shareStatus && (
            <p className="approved-share-status" role="status">
              {shareStatus}
            </p>
          )}
          <small>
            {canSharePublicProfile
              ? "Sharing uses your canonical public profile URL."
              : "Your profile is not public, so sharing links back to AKARI House."}
          </small>
        </Form>
      </div>
    </main>
  );
}
