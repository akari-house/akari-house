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

function titleCaseRole(role: string) {
  return role ? role[0].toUpperCase() + role.slice(1) : role;
}

function profileCardCode(username: string) {
  const clean = username.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const prefix = clean.slice(0, 4).padEnd(4, "X");
  let hash = 2166136261;
  for (const character of username) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const suffix = hash.toString(36).toUpperCase().padStart(7, "0").slice(-7);
  return `AKARI-${prefix}-${suffix}`;
}

function barcodePattern(value: string) {
  const codes = [...value].map((character) => character.charCodeAt(0));
  return Array.from({ length: 54 }, (_, index) => {
    const code = codes[index % Math.max(codes.length, 1)] ?? 65;
    return {
      width: 1 + ((code + index * 5) % 3),
      gap: 1 + ((code + index * 7) % 2),
    };
  });
}

function ProfileBarcode({ value }: { value: string }) {
  const bars = barcodePattern(value);
  const total = bars.reduce((sum, bar) => sum + bar.width + bar.gap, 0);
  let cursor = 0;
  return (
    <svg
      viewBox={`0 0 ${total} 32`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {bars.map((bar, index) => {
        const x = cursor;
        cursor += bar.width + bar.gap;
        const inset = index % 7 === 0 ? 3 : index % 5 === 0 ? 1.5 : 0;
        return (
          <rect
            key={`${x}-${index}`}
            x={x}
            y={inset}
            width={bar.width}
            height={32 - inset * 2}
            rx={0.2}
          />
        );
      })}
    </svg>
  );
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

function LinkGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.5 13.5l3-3" />
      <path
        d="M7.4 16.6l-1 1a3.5 3.5 0 01-5-5l3.1-3.1a3.5 3.5 0 014.9 0"
        transform="translate(3 0)"
      />
      <path
        d="M16.6 7.4l1-1a3.5 3.5 0 015 5l-3.1 3.1a3.5 3.5 0 01-4.9 0"
        transform="translate(-3 0)"
      />
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

function drawBarcode(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: string,
) {
  const bars = barcodePattern(value);
  const total = bars.reduce((sum, bar) => sum + bar.width + bar.gap, 0);
  const scale = width / total;
  let cursor = 0;
  ctx.save();
  ctx.fillStyle = colour;
  bars.forEach((bar, index) => {
    const inset = index % 7 === 0 ? 7 : index % 5 === 0 ? 3 : 0;
    ctx.fillRect(
      x + cursor * scale,
      y + inset,
      Math.max(1.2, bar.width * scale),
      height - inset * 2,
    );
    cursor += bar.width + bar.gap;
  });
  ctx.restore();
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
      platform === "linkedin" ? "in" : platform === "facebook" ? "f" : "♪",
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
  canvas.width = 1600;
  canvas.height = 1009;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const palette = palettes[settings.palette];
  const languages = settings.showLanguages
    ? parseProfileCardLanguages(settings.languagesJson)
    : [];
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => titleCaseRole(state.role));
  const opportunities =
    model.opportunityStats.created + model.opportunityStats.received;
  const profileCode = profileCardCode(model.username);
  const canonicalUrl =
    model.accessTier === "member" && model.visibility === "public"
      ? `akarihouse.com/profiles/${model.username}`
      : "Private AKARI profile";

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ambient = ctx.createRadialGradient(1400, 120, 0, 1400, 120, 800);
  ambient.addColorStop(0, `${palette.accent}55`);
  ambient.addColorStop(0.48, `${palette.accent}16`);
  ambient.addColorStop(1, `${palette.accent}00`);
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const warm = ctx.createRadialGradient(90, 860, 0, 90, 860, 620);
  warm.addColorStop(0, `${palette.highlight}38`);
  warm.addColorStop(1, `${palette.highlight}00`);
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 60;
  roundedRect(ctx, 34, 34, 1532, 941, 72);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.restore();

  const edge = ctx.createLinearGradient(40, 40, 1560, 970);
  edge.addColorStop(0, palette.highlight);
  edge.addColorStop(0.38, `${palette.ink}aa`);
  edge.addColorStop(0.72, palette.accent);
  edge.addColorStop(1, palette.accent);
  roundedRect(ctx, 32, 32, 1536, 945, 74);
  ctx.lineWidth = 6;
  ctx.strokeStyle = edge;
  ctx.stroke();
  roundedRect(ctx, 51, 51, 1498, 907, 58);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `${palette.ink}55`;
  ctx.stroke();

  const gloss = ctx.createLinearGradient(250, 50, 900, 500);
  gloss.addColorStop(0, `${palette.ink}22`);
  gloss.addColorStop(0.45, `${palette.ink}05`);
  gloss.addColorStop(1, `${palette.ink}00`);
  ctx.beginPath();
  ctx.moveTo(90, 65);
  ctx.lineTo(760, 65);
  ctx.lineTo(480, 470);
  ctx.lineTo(80, 470);
  ctx.closePath();
  ctx.fillStyle = gloss;
  ctx.fill();

  try {
    const flower = await loadImage("/assets/brand/akari-flower-mark.png");
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.drawImage(flower, 1140, 545, 330, 330);
    ctx.restore();
  } catch {
    // Decorative watermark only.
  }

  try {
    const logo = await loadImage("/assets/brand/akari-logo-horizontal.png");
    const logoWidth = 330;
    const logoHeight = logoWidth * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, 1050, 92, logoWidth, logoHeight);
    ctx.fillStyle = palette.ink;
    ctx.font = "600 19px Inter, sans-serif";
    ctx.fillText("AKARI HOUSE", 1050, 92 + logoHeight + 29);
  } catch {
    ctx.fillStyle = palette.accent;
    ctx.font = "800 32px Inter, sans-serif";
    ctx.fillText("AKARI HOUSE", 1050, 132);
  }

  const photoX = 115;
  const photoY = 145;
  const photoSize = 310;
  const avatarRing = ctx.createLinearGradient(
    photoX,
    photoY,
    photoX + photoSize,
    photoY + photoSize,
  );
  avatarRing.addColorStop(0, palette.highlight);
  avatarRing.addColorStop(0.52, palette.accent);
  avatarRing.addColorStop(1, `${palette.ink}88`);
  ctx.beginPath();
  ctx.arc(
    photoX + photoSize / 2,
    photoY + photoSize / 2,
    photoSize / 2 + 18,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = avatarRing;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
    photoX + photoSize / 2,
    photoY + photoSize / 2,
    photoSize / 2 + 5,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = `${palette.ink}66`;
  ctx.lineWidth = 3;
  ctx.stroke();

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
      const scale = Math.max(
        photoSize / photo.naturalWidth,
        photoSize / photo.naturalHeight,
      );
      const width = photo.naturalWidth * scale;
      const height = photo.naturalHeight * scale;
      ctx.drawImage(
        photo,
        photoX + (photoSize - width) / 2,
        photoY + (photoSize - height) / 2,
        width,
        height,
      );
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
    ctx.font = "800 92px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      profileCardInitials(model.displayName),
      photoX + photoSize / 2,
      photoY + photoSize / 2 + 30,
    );
    ctx.textAlign = "left";
  }

  try {
    const flower = await loadImage("/assets/brand/akari-flower-mark.png");
    roundedRect(ctx, 366, 387, 94, 94, 47);
    ctx.fillStyle = `${palette.background}e8`;
    ctx.fill();
    ctx.strokeStyle = `${palette.ink}55`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(flower, 380, 401, 66, 66);
  } catch {
    // Avatar brand seal is optional if decoding fails.
  }

  const identityX = 520;
  ctx.fillStyle = palette.ink;
  ctx.font = "800 72px Inter, sans-serif";
  ctx.fillText(model.displayName.slice(0, 24), identityX, 305);
  ctx.font = "500 30px Inter, sans-serif";
  ctx.globalAlpha = 0.78;
  ctx.fillText(`@${model.username}`, identityX, 354);
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.highlight;
  ctx.font = "650 31px Inter, sans-serif";
  ctx.fillText(
    model.roles.map(titleCaseRole).join(" · ").slice(0, 48) || "AKARI Member",
    identityX,
    413,
  );
  if (model.headline) {
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.83;
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillText(model.headline.slice(0, 57), identityX, 461);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = palette.accent;
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText(
    verifiedRoles.length
      ? `AKARI VERIFIED · ${verifiedRoles.join(" · ")}`
      : "AKARI MEMBER",
    identityX,
    505,
  );

  let pillX = identityX;
  model.roles.slice(0, 3).forEach((role) => {
    const label = titleCaseRole(role);
    ctx.font = "650 20px Inter, sans-serif";
    const width = Math.max(112, ctx.measureText(label).width + 54);
    roundedRect(ctx, pillX, 534, width, 52, 26);
    ctx.fillStyle = palette.surface;
    ctx.fill();
    ctx.strokeStyle = `${palette.accent}88`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    ctx.fillText(label, pillX + 27, 568);
    pillX += width + 16;
  });

  roundedRect(ctx, 1190, 260, 280, 310, 38);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = `${palette.accent}99`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.font = "700 17px Inter, sans-serif";
  ctx.fillText("AKARI ID", 1230, 314);
  drawBarcode(ctx, profileCode, 1222, 344, 216, 76, palette.ink);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 16px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(profileCode, 1330, 455);
  ctx.font = "650 20px Inter, sans-serif";
  ctx.fillText("Connect on AKARI", 1330, 493);
  ctx.font = "500 14px Inter, sans-serif";
  ctx.globalAlpha = 0.66;
  ctx.fillText(canonicalUrl.slice(0, 34), 1330, 526);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";

  const metrics = [
    [String(opportunities), "OPPORTUNITIES"],
    [formatProfileReach(model.followerCount), "SOCIAL REACH"],
    [String(model.socials.length), "CONNECTED SOCIALS"],
    [
      model.percentile.topPercent
        ? `TOP ${model.percentile.topPercent}%`
        : "BUILDING",
      "AKARI SIGNAL",
    ],
  ] as const;
  roundedRect(ctx, 115, 625, 1010, 116, 30);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = `${palette.ink}2f`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  metrics.forEach(([value, label], index) => {
    const x = 150 + index * 245;
    ctx.fillStyle = index % 2 === 0 ? palette.highlight : palette.accent;
    ctx.font = "750 28px Inter, sans-serif";
    ctx.fillText(value, x, 677);
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.65;
    ctx.font = "700 12px Inter, sans-serif";
    ctx.fillText(label, x, 708);
    ctx.globalAlpha = 1;
  });

  roundedRect(ctx, 115, 765, 1010, 104, 28);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = `${palette.ink}2f`;
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "600 23px Inter, sans-serif";
  ctx.fillText("Connect with me", 165, 827);
  const visibleSocials = model.socials.slice(0, 6);
  visibleSocials.forEach((social, index) => {
    const circleX = 475 + index * 76;
    ctx.beginPath();
    ctx.arc(circleX, 817, 28, 0, Math.PI * 2);
    ctx.fillStyle = `${palette.ink}0d`;
    ctx.fill();
    ctx.strokeStyle = `${palette.ink}45`;
    ctx.stroke();
    drawSocialMark(ctx, social.platform, circleX - 12, 805, palette.ink);
  });

  roundedRect(ctx, 1150, 625, 320, 244, 30);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = `${palette.ink}2f`;
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "700 15px Inter, sans-serif";
  ctx.globalAlpha = 0.62;
  ctx.fillText("PROFILE DETAILS", 1190, 675);
  ctx.globalAlpha = 1;
  ctx.font = "600 18px Inter, sans-serif";
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "Location private";
  ctx.fillText(location.slice(0, 30), 1190, 718);
  if (languages.length) {
    ctx.font = "500 15px Inter, sans-serif";
    ctx.globalAlpha = 0.73;
    ctx.fillText(languages.slice(0, 3).join(" · ").slice(0, 36), 1190, 754);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = palette.accent;
  ctx.font = "700 16px Inter, sans-serif";
  ctx.fillText(
    settings.design === "passport" ? "MEMBER PASSPORT" : "PROFILE SIGNATURE",
    1190,
    816,
  );

  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.66;
  ctx.font = "500 17px Inter, sans-serif";
  ctx.fillText("akarihouse.com", 118, 925);
  ctx.textAlign = "right";
  ctx.fillText("A private membership for high-signal connections.", 1470, 925);
  ctx.textAlign = "left";
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

  const profileCode = profileCardCode(model.username);
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
            A premium AKARI member card built from your real member data. Choose
            your glass color, control what stays public, then download or share.
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

              <div
                className="glass-profile-link"
                aria-label="AKARI identity code"
              >
                <small>AKARI ID</small>
                <span className="glass-profile-barcode" aria-hidden="true">
                  <ProfileBarcode value={profileCode} />
                </span>
                <strong>{profileCode}</strong>
                <span>{canonicalUrl}</span>
              </div>
            </div>

            <div
              className="share-card-metrics glass-card-metrics"
              aria-label="Profile credibility signals"
            >
              <div>
                <strong>{opportunities}</strong>
                <span>Opportunities</span>
              </div>
              <div>
                <strong>{formatProfileReach(model.followerCount)}</strong>
                <span>Social reach</span>
              </div>
              <div>
                <strong>{model.socials.length}</strong>
                <span>Connected socials</span>
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
            <strong>Built for sharing.</strong>
            <span>Export as PNG and share your AKARI identity anywhere.</span>
          </div>
          <p className="share-card-confidence">
            {model.percentile.confidence === "verified"
              ? "Credibility signals use verified member data."
              : model.percentile.confidence === "provisional"
                ? "Credibility signals include member-reported data."
                : "Credibility signals grow as more comparable member data becomes available."}
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
                disabled={
                  !languageToAdd ||
                  languages.length >= MAX_PROFILE_CARD_LANGUAGES
                }
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
                      updateLanguages(
                        languages.filter((item) => item !== language),
                      )
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

          {shareStatus && (
            <p className="glass-share-status" role="status">
              {shareStatus}
            </p>
          )}

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
