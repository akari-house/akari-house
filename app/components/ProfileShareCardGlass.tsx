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
import "~/styles/r79-profile-sharing-glass.css";

type GlassPalette = {
  label: string;
  description: string;
  background: string;
  backgroundEnd: string;
  ink: string;
  muted: string;
  accent: string;
  glow: string;
  panel: string;
  panelStroke: string;
};

const palettes: Record<ProfileCardPalette, GlassPalette> = {
  midnight: {
    label: "Midnight Glass",
    description: "Black glass with AKARI pink and lantern-yellow edges.",
    background: "#070a11",
    backgroundEnd: "#11101a",
    ink: "#fffaf5",
    muted: "#c6bfca",
    accent: "#f04f87",
    glow: "#ffd166",
    panel: "rgba(255,255,255,.055)",
    panelStroke: "rgba(255,255,255,.19)",
  },
  sakura: {
    label: "Sakura Glass",
    description: "Deep berry glass with vivid pink and yellow brand light.",
    background: "#250916",
    backgroundEnd: "#3b1029",
    ink: "#fff9f5",
    muted: "#e6c7d4",
    accent: "#ff6799",
    glow: "#ffd84d",
    panel: "rgba(255,255,255,.065)",
    panelStroke: "rgba(255,178,204,.27)",
  },
  lantern: {
    label: "Pearl Glass",
    description: "Warm pearl glass with soft sakura-pink and yellow highlights.",
    background: "#fff7ed",
    backgroundEnd: "#ffe9ee",
    ink: "#2b1720",
    muted: "#755d68",
    accent: "#f04f87",
    glow: "#f6bd2f",
    panel: "rgba(255,255,255,.55)",
    panelStroke: "rgba(240,79,135,.22)",
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

function roleLabel(role: string) {
  return role ? role[0]?.toUpperCase() + role.slice(1) : role;
}

function flagFor(code: string) {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(
        ...[...code].map((letter) => 127397 + letter.charCodeAt(0)),
      )
    : "";
}

function avatarUrl(model: ProfileCardModel) {
  return model.avatarKey
    ? `/media/profile/${encodeURIComponent(model.username)}?v=${encodeURIComponent(model.avatarKey)}`
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
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function glassPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke: string,
) {
  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const boxRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (imageRatio > boxRatio) {
    sourceWidth = image.naturalHeight * boxRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / boxRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 700,
) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
    if (ctx.measureText(value).width <= maxWidth || size <= minSize) return size;
    size -= 2;
  } while (size >= minSize);
  return minSize;
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
    ctx.moveTo(3, 3);
    ctx.lineTo(23, 23);
    ctx.moveTo(23, 3);
    ctx.lineTo(3, 23);
    ctx.stroke();
  } else if (platform === "instagram") {
    roundedRect(ctx, 2, 2, 23, 23, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13.5, 13.5, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, 6.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (platform === "youtube") {
    roundedRect(ctx, 1, 5, 25, 17, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(11, 9);
    ctx.lineTo(19, 13.5);
    ctx.lineTo(11, 18);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = "700 21px Inter, Arial, sans-serif";
    ctx.fillText(
      platform === "linkedin" ? "in" : platform === "facebook" ? "f" : "♪",
      4,
      21,
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
  canvas.width = portrait ? 1000 : 1586;
  canvas.height = portrait ? 1586 : 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const palette = palettes[settings.palette];
  const light = settings.palette === "lantern";
  const width = canvas.width;
  const height = canvas.height;
  const scaleX = width / 1586;
  const scaleY = height / 1000;
  const scale = portrait ? Math.min(scaleX, scaleY) : scaleX;
  const canonicalUrl =
    model.accessTier === "member" && model.visibility === "public"
      ? `akarihouse.com/profiles/${model.username}`
      : "Private AKARI profile";
  const languages = settings.showLanguages
    ? parseProfileCardLanguages(settings.languagesJson)
    : [];
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "Location private";
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => roleLabel(state.role));
  const opportunities =
    model.opportunityStats.created + model.opportunityStats.received;

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, palette.background);
  base.addColorStop(1, palette.backgroundEnd);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const bloom = ctx.createRadialGradient(
    width * 0.08,
    height * 0.05,
    0,
    width * 0.08,
    height * 0.05,
    width * 0.55,
  );
  bloom.addColorStop(0, palette.glow + (light ? "45" : "30"));
  bloom.addColorStop(1, palette.glow + "00");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  const pinkBloom = ctx.createRadialGradient(
    width * 0.95,
    height * 0.08,
    0,
    width * 0.95,
    height * 0.08,
    width * 0.65,
  );
  pinkBloom.addColorStop(0, palette.accent + (light ? "36" : "40"));
  pinkBloom.addColorStop(1, palette.accent + "00");
  ctx.fillStyle = pinkBloom;
  ctx.fillRect(0, 0, width, height);

  const border = ctx.createLinearGradient(0, 0, width, height);
  border.addColorStop(0, palette.glow);
  border.addColorStop(0.46, light ? "#fffdf9" : "#7587a8");
  border.addColorStop(1, palette.accent);
  roundedRect(ctx, 38, 38, width - 76, height - 76, 60);
  ctx.strokeStyle = border;
  ctx.lineWidth = 8;
  ctx.stroke();
  roundedRect(ctx, 57, 57, width - 114, height - 114, 50);
  ctx.strokeStyle = light ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const sheen = ctx.createLinearGradient(0, 0, width, height * 0.55);
  sheen.addColorStop(0, light ? "rgba(255,255,255,.68)" : "rgba(255,255,255,.18)");
  sheen.addColorStop(0.34, "rgba(255,255,255,.02)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  roundedRect(ctx, 64, 64, width - 128, height - 128, 46);
  ctx.clip();
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.moveTo(75, 70);
  ctx.lineTo(width * 0.48, 70);
  ctx.lineTo(width * 0.28, height * 0.58);
  ctx.lineTo(75, height * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (portrait) {
    glassPanel(
      ctx,
      82,
      900,
      width - 164,
      270,
      34,
      palette.panel,
      palette.panelStroke,
    );
  }

  let logo: HTMLImageElement | null = null;
  let flower: HTMLImageElement | null = null;
  try {
    [logo, flower] = await Promise.all([
      loadImage("/assets/brand/akari-logo-horizontal.png"),
      loadImage("/assets/brand/akari-flower-mark.png"),
    ]);
  } catch {
    logo = null;
    flower = null;
  }

  if (!portrait) {
    if (logo) {
      ctx.drawImage(logo, 910, 82, 500, 145);
    } else {
      ctx.fillStyle = palette.accent;
      ctx.font = "800 46px Inter, Arial, sans-serif";
      ctx.fillText("AKARI HOUSE", 960, 145);
    }
    ctx.fillStyle = palette.muted;
    ctx.font = "500 22px Inter, Arial, sans-serif";
    ctx.fillText("Illuminate. Connect. Elevate.", 1010, 205);
  } else {
    if (logo) ctx.drawImage(logo, 530, 70, 390, 112);
    ctx.fillStyle = palette.muted;
    ctx.font = "500 20px Inter, Arial, sans-serif";
    ctx.fillText("Illuminate. Connect. Elevate.", 568, 196);
  }

  const photoSize = portrait ? 250 : 320;
  const photoX = portrait ? 90 : 125;
  const photoY = portrait ? 220 : 205;
  const ring = ctx.createLinearGradient(photoX, photoY, photoX + photoSize, photoY + photoSize);
  ring.addColorStop(0, palette.glow);
  ring.addColorStop(0.52, palette.accent);
  ring.addColorStop(1, light ? "#fff9f4" : "#7c88a7");
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 19, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2 + 5, 0, Math.PI * 2);
  ctx.strokeStyle = light ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.28)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(photoX + photoSize / 2, photoY + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
  ctx.clip();
  const imageUrl = avatarUrl(model);
  if (imageUrl) {
    try {
      const photo = await loadImage(imageUrl);
      drawImageCover(ctx, photo, photoX, photoY, photoSize, photoSize);
    } catch {
      ctx.fillStyle = palette.panel;
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }
  } else {
    ctx.fillStyle = palette.panel;
    ctx.fillRect(photoX, photoY, photoSize, photoSize);
  }
  ctx.restore();

  if (!imageUrl) {
    ctx.fillStyle = palette.ink;
    ctx.font = `800 ${portrait ? 84 : 105}px Inter, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      profileCardInitials(model.displayName),
      photoX + photoSize / 2,
      photoY + photoSize / 2 + 32,
    );
    ctx.textAlign = "left";
  }

  if (flower) {
    const badgeSize = portrait ? 78 : 92;
    const badgeX = photoX + photoSize - badgeSize * 0.45;
    const badgeY = photoY + photoSize - badgeSize * 0.7;
    glassPanel(
      ctx,
      badgeX,
      badgeY,
      badgeSize,
      badgeSize,
      badgeSize / 2,
      light ? "rgba(255,255,255,.8)" : "rgba(9,12,20,.82)",
      palette.panelStroke,
    );
    ctx.drawImage(flower, badgeX + 11, badgeY + 11, badgeSize - 22, badgeSize - 22);
  }

  const identityX = portrait ? 90 : 535;
  const identityY = portrait ? 585 : 320;
  const identityWidth = portrait ? 820 : 545;
  ctx.fillStyle = palette.ink;
  fitCanvasText(ctx, model.displayName.slice(0, 30), identityWidth, portrait ? 76 : 76, 48, 800);
  ctx.fillText(model.displayName.slice(0, 30), identityX, identityY);
  ctx.fillStyle = palette.muted;
  ctx.font = `500 ${portrait ? 28 : 30}px Inter, Arial, sans-serif`;
  ctx.fillText(`@${model.username}`, identityX, identityY + 48);
  ctx.fillStyle = palette.glow;
  ctx.font = `650 ${portrait ? 26 : 29}px Inter, Arial, sans-serif`;
  ctx.fillText(model.roles.map(roleLabel).join(" • "), identityX, identityY + 102);
  if (model.headline) {
    ctx.fillStyle = palette.muted;
    ctx.font = `500 ${portrait ? 23 : 24}px Inter, Arial, sans-serif`;
    const headline = model.headline.slice(0, portrait ? 68 : 62);
    ctx.fillText(headline, identityX, identityY + 148);
  }

  const chipY = identityY + (model.headline ? 186 : 142);
  let chipX = identityX;
  model.roles.slice(0, 3).forEach((role, index) => {
    const label = roleLabel(role);
    ctx.font = "650 19px Inter, Arial, sans-serif";
    const chipWidth = Math.max(118, ctx.measureText(label).width + 48);
    glassPanel(
      ctx,
      chipX,
      chipY,
      chipWidth,
      48,
      24,
      palette.panel,
      index === 0 ? palette.glow + "99" : palette.accent + "99",
    );
    ctx.fillStyle = index === 0 ? palette.glow : palette.accent;
    ctx.fillText(label, chipX + 24, chipY + 31);
    chipX += chipWidth + 14;
  });

  const linkPanelX = portrait ? 90 : 1160;
  const linkPanelY = portrait ? 900 : 285;
  const linkPanelWidth = portrait ? 820 : 305;
  const linkPanelHeight = portrait ? 210 : 315;
  glassPanel(
    ctx,
    linkPanelX,
    linkPanelY,
    linkPanelWidth,
    linkPanelHeight,
    30,
    palette.panel,
    palette.panelStroke,
  );
  if (flower) {
    const flowerSize = portrait ? 110 : 118;
    ctx.globalAlpha = light ? 0.92 : 0.96;
    ctx.drawImage(
      flower,
      linkPanelX + (portrait ? 32 : (linkPanelWidth - flowerSize) / 2),
      linkPanelY + 34,
      flowerSize,
      flowerSize,
    );
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = palette.ink;
  ctx.font = `700 ${portrait ? 24 : 23}px Inter, Arial, sans-serif`;
  ctx.textAlign = portrait ? "left" : "center";
  ctx.fillText(
    canShareLabel(model),
    portrait ? linkPanelX + 180 : linkPanelX + linkPanelWidth / 2,
    portrait ? linkPanelY + 80 : linkPanelY + 192,
  );
  ctx.fillStyle = palette.muted;
  ctx.font = `500 ${portrait ? 18 : 16}px Inter, Arial, sans-serif`;
  const profileLabel = canonicalUrl.length > 37 ? `@${model.username}` : canonicalUrl;
  ctx.fillText(
    profileLabel,
    portrait ? linkPanelX + 180 : linkPanelX + linkPanelWidth / 2,
    portrait ? linkPanelY + 118 : linkPanelY + 226,
  );
  ctx.textAlign = "left";

  if (!portrait) {
    glassPanel(
      ctx,
      118,
      650,
      930,
      118,
      26,
      palette.panel,
      palette.panelStroke,
    );
    ctx.fillStyle = palette.ink;
    ctx.font = "600 23px Inter, Arial, sans-serif";
    ctx.fillText("Connect with me", 168, 718);
    ctx.strokeStyle = palette.panelStroke;
    ctx.beginPath();
    ctx.moveTo(410, 676);
    ctx.lineTo(410, 744);
    ctx.stroke();
    model.socials.slice(0, 5).forEach((social, index) => {
      const centerX = 500 + index * 92;
      ctx.beginPath();
      ctx.arc(centerX, 710, 32, 0, Math.PI * 2);
      ctx.fillStyle = light ? "rgba(255,255,255,.62)" : "rgba(0,0,0,.18)";
      ctx.fill();
      ctx.strokeStyle = palette.panelStroke;
      ctx.stroke();
      drawSocialMark(ctx, social.platform, centerX - 13, 697, index === 0 ? palette.glow : palette.ink);
    });

    glassPanel(
      ctx,
      118,
      805,
      width - 236,
      92,
      24,
      palette.panel,
      palette.panelStroke,
    );
    ctx.fillStyle = palette.accent;
    ctx.font = "700 22px Inter, Arial, sans-serif";
    ctx.fillText("akarihouse.com", 168, 861);
    ctx.fillStyle = palette.muted;
    ctx.font = "500 20px Inter, Arial, sans-serif";
    ctx.fillText("A private ecosystem for high-signal connections.", 520, 861);

    const metricText = `${opportunities} opportunities  •  ${formatProfileReach(model.followerCount)} reach${model.percentile.topPercent ? `  •  Top ${model.percentile.topPercent}%` : ""}`;
    ctx.textAlign = "right";
    ctx.fillStyle = palette.muted;
    ctx.font = "500 17px Inter, Arial, sans-serif";
    ctx.fillText(metricText, width - 155, 760);
    ctx.textAlign = "left";
  } else {
    ctx.fillStyle = palette.muted;
    ctx.font = "500 21px Inter, Arial, sans-serif";
    ctx.fillText(location, 115, 1235);
    if (languages.length) ctx.fillText(languages.join(" • "), 115, 1270);
    ctx.fillStyle = palette.accent;
    ctx.font = "700 22px Inter, Arial, sans-serif";
    ctx.fillText("akarihouse.com", 115, 1370);
    ctx.fillStyle = palette.muted;
    ctx.font = "500 18px Inter, Arial, sans-serif";
    ctx.fillText("A private ecosystem for high-signal connections.", 115, 1410);
  }

  if (!portrait && (settings.showLocation || (settings.showLanguages && languages.length))) {
    ctx.fillStyle = palette.muted;
    ctx.font = "500 15px Inter, Arial, sans-serif";
    const privateLine = [settings.showLocation ? location : "", ...languages].filter(Boolean).join("  •  ");
    ctx.fillText(privateLine.slice(0, 92), 118, 935);
  }

  if (verifiedRoles.length) {
    ctx.fillStyle = palette.accent;
    ctx.font = "650 15px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`Verified • ${verifiedRoles.join(" • ")}`, width - 120, height - 65);
    ctx.textAlign = "left";
  }

  void scale;
}

function canShareLabel(model: ProfileCardModel) {
  return model.accessTier === "member" && model.visibility === "public"
    ? "View my AKARI profile"
    : "AKARI member profile";
}

export function ProfileShareCardGlass({
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
  const [shareNotice, setShareNotice] = useState("");
  const palette = palettes[settings.palette];
  const languages = useMemo(
    () => parseProfileCardLanguages(settings.languagesJson),
    [settings.languagesJson],
  );
  const roles = model.roles.map(roleLabel);
  const verifiedRoles = model.verificationStates
    .filter((state) => state.status === "verified")
    .map((state) => roleLabel(state.role));
  const canSharePublicProfile =
    model.accessTier === "member" && model.visibility === "public";
  const canonicalUrl = canSharePublicProfile
    ? `akarihouse.com/profiles/${model.username}`
    : "Private AKARI profile";
  const location =
    settings.showLocation && model.location
      ? `${flagFor(settings.countryCode)} ${model.location}`.trim()
      : "Location private";
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
    link.download = `akari-${model.username}-${settings.palette}-${settings.orientation}.png`;
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
      setShareNotice("Share sheet opened.");
    } else {
      await navigator.clipboard.writeText(publicUrl);
      setShareNotice("Profile link copied.");
    }
  }

  return (
    <main id="main-content" className="share-card-main glass-share-card-main">
      <header className="share-card-heading">
        <div>
          <span className="eyebrow">Your AKARI identity</span>
          <h1>Profile sharing card</h1>
          <p>
            Build a premium AKARI card from your real profile, choose your glass
            theme, then download or share it.
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
      {shareNotice && (
        <p className="success-banner" role="status">
          {shareNotice}
        </p>
      )}

      <div className="share-card-layout glass-share-card-layout">
        <section className="share-card-stage glass-share-card-stage" aria-label="Card preview">
          <article
            className={`akari-glass-card ${settings.orientation} ${settings.design} theme-${settings.palette}`}
            style={
              {
                "--card-bg": palette.background,
                "--card-bg-end": palette.backgroundEnd,
                "--card-ink": palette.ink,
                "--card-muted": palette.muted,
                "--card-accent": palette.accent,
                "--card-glow": palette.glow,
                "--card-panel": palette.panel,
                "--card-panel-stroke": palette.panelStroke,
              } as CSSProperties
            }
          >
            <span className="glass-card-sheen" aria-hidden="true" />
            <img
              className="glass-card-watermark"
              src="/assets/brand/akari-flower-mark.png"
              alt=""
              aria-hidden="true"
            />

            <div className="glass-card-brand-lockup">
              <img src="/assets/brand/akari-logo-horizontal.png" alt="AKARI" />
              <span>HOUSE</span>
              <small>Illuminate. Connect. Elevate.</small>
            </div>

            <div className="glass-card-body">
              <div className="glass-card-avatar-wrap">
                <div className="glass-card-avatar-ring">
                  <div className="glass-card-avatar">
                    {model.avatarKey ? (
                      <img
                        src={avatarUrl(model)}
                        alt={`${model.displayName}'s profile`}
                        width={220}
                        height={220}
                      />
                    ) : (
                      <span aria-hidden="true">
                        {profileCardInitials(model.displayName)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="glass-card-avatar-badge" aria-hidden="true">
                  <img src="/assets/brand/akari-flower-mark.png" alt="" />
                </span>
              </div>

              <div className="glass-card-identity">
                <span className="glass-card-kicker">
                  {settings.design === "passport" ? "Member passport" : "AKARI member"}
                </span>
                <h2>{model.displayName}</h2>
                <p className="glass-card-handle">@{model.username}</p>
                <p className="glass-card-role-line">{roles.join(" • ")}</p>
                {model.headline && <p className="glass-card-headline">{model.headline}</p>}
                <div className="glass-card-role-chips" aria-label="Member roles">
                  {roles.slice(0, 3).map((role, index) => (
                    <span key={role} className={index === 0 ? "primary" : undefined}>
                      {role}
                    </span>
                  ))}
                </div>
                {verifiedRoles.length > 0 && (
                  <span className="glass-card-verified">Verified • {verifiedRoles.join(" • ")}</span>
                )}
              </div>

              <div className="glass-card-profile-plate">
                <img src="/assets/brand/akari-flower-mark.png" alt="" aria-hidden="true" />
                <strong>{canShareLabel(model)}</strong>
                <span>{canonicalUrl}</span>
              </div>
            </div>

            <div className="glass-card-lower">
              <div className="glass-card-connect">
                <strong>Connect with me</strong>
                <span className="glass-card-divider" aria-hidden="true" />
                <div className="glass-card-socials" aria-label="Connected social platforms">
                  {model.socials.slice(0, 5).map((social) => (
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
                  {model.socials.length === 0 && <span className="glass-card-no-socials">Add socials in your profile</span>}
                </div>
              </div>

              <div className="glass-card-signal-row" aria-label="AKARI profile signals">
                <span>{model.opportunityStats.created + model.opportunityStats.received} opportunities</span>
                <span>{formatProfileReach(model.followerCount)} reach</span>
                <span>{model.percentile.topPercent ? `Top ${model.percentile.topPercent}%` : "Building signal"}</span>
              </div>

              <footer className="glass-card-footer">
                <strong>akarihouse.com</strong>
                <span>A private ecosystem for high-signal connections.</span>
                {(settings.showLocation || (settings.showLanguages && languages.length > 0)) && (
                  <small>
                    {[settings.showLocation ? location : "", ...(settings.showLanguages ? languages : [])]
                      .filter(Boolean)
                      .join(" • ")}
                  </small>
                )}
              </footer>
            </div>
          </article>

          <p className="share-card-confidence">
            {model.percentile.confidence === "verified"
              ? "Percentile uses verified member signals."
              : model.percentile.confidence === "provisional"
                ? "Provisional percentile: one or more signals are member-reported."
                : "Your percentile appears after enough comparable member signals exist."}
          </p>
        </section>

        <Form method="post" className="share-card-controls glass-share-card-controls">
          <fieldset>
            <legend>Card design</legend>
            <label>
              <input
                type="radio"
                name="design"
                value="signature"
                checked={settings.design === "signature"}
                onChange={() => setSettings({ ...settings, design: "signature" })}
              />
              Signature Glass
            </label>
            <label>
              <input
                type="radio"
                name="design"
                value="passport"
                checked={settings.design === "passport"}
                onChange={() => setSettings({ ...settings, design: "passport" })}
              />
              Passport Glass
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
                onChange={() => setSettings({ ...settings, orientation: "landscape" })}
              />
              Credit card
            </label>
            <label>
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={settings.orientation === "portrait"}
                onChange={() => setSettings({ ...settings, orientation: "portrait" })}
              />
              Portrait
            </label>
          </fieldset>

          <fieldset className="glass-theme-fieldset">
            <legend>Glass colour</legend>
            <div className="glass-theme-grid">
              {Object.entries(palettes).map(([value, item]) => (
                <label key={value} className={`glass-theme-choice theme-choice-${value}`}>
                  <input
                    type="radio"
                    name="palette"
                    value={value}
                    checked={settings.palette === value}
                    onChange={() =>
                      setSettings({ ...settings, palette: value as ProfileCardPalette })
                    }
                  />
                  <span className="glass-theme-swatch" aria-hidden="true" />
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
                setSettings({ ...settings, showLanguages: event.target.checked ? 1 : 0 })
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
                    onClick={() => updateLanguages(languages.filter((item) => item !== language))}
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
                setSettings({ ...settings, countryCode: event.target.value.toUpperCase() })
              }
            />
          </label>

          <label className="share-card-check">
            <input
              type="checkbox"
              name="showLocation"
              checked={Boolean(settings.showLocation)}
              onChange={(event) =>
                setSettings({ ...settings, showLocation: event.target.checked ? 1 : 0 })
              }
            />
            Show profile location
          </label>

          <button className="button button-secondary" disabled={navigation.state !== "idle"}>
            {navigation.state === "idle" ? "Save preferences" : "Saving…"}
          </button>

          <div className="share-card-actions">
            <button type="button" className="button button-primary" onClick={() => void download()}>
              Download PNG
            </button>
            <button type="button" className="button button-secondary" onClick={() => void share()}>
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
