import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`R92 patch target missing: ${label}`);
  }
  return source.replace(before, after);
}

const componentPath = "app/components/ProfileShareCard.tsx";
let component = readFileSync(componentPath, "utf8");

component = replaceOnce(
  component,
  'import "~/styles/profile-card-enhancements.css";',
  `import {
  buildProfileQrMatrix,
  profileQrPath,
  PROFILE_QR_MODULES,
  PROFILE_QR_QUIET_ZONE,
} from "~/lib/qr-code";
import "~/styles/profile-card-enhancements.css";`,
  "QR import",
);

component = replaceOnce(
  component,
  `const socialLabels: Record<ProfileCardSocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};`,
  `const socialLabels: Record<ProfileCardSocialPlatform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
};

const CARD_SOCIAL_LIMIT = 4;`,
  "social limit",
);

component = replaceOnce(
  component,
  `function avatarUrl(model: ProfileCardModel) {`,
  `function ProfileQrCode({ value }: { value: string }) {
  const matrix = useMemo(() => buildProfileQrMatrix(value), [value]);
  const viewBoxSize = PROFILE_QR_MODULES + PROFILE_QR_QUIET_ZONE * 2;

  return (
    <svg
      className="glass-profile-qr"
      viewBox={\`0 0 \${viewBoxSize} \${viewBoxSize}\`}
      role="img"
      aria-label="QR code for public AKARI profile"
      shapeRendering="crispEdges"
    >
      <rect width={viewBoxSize} height={viewBoxSize} rx="1.25" fill="#fff" />
      <path
        d={profileQrPath(matrix, PROFILE_QR_QUIET_ZONE)}
        fill="#111"
      />
    </svg>
  );
}

function avatarUrl(model: ProfileCardModel) {`,
  "QR component",
);

component = replaceOnce(
  component,
  `function drawSocialMark(
  ctx: CanvasRenderingContext2D,`,
  `function drawProfileQr(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
) {
  const matrix = buildProfileQrMatrix(value);
  const totalModules = PROFILE_QR_MODULES + PROFILE_QR_QUIET_ZONE * 2;
  const moduleSize = Math.max(1, Math.floor(size / totalModules));
  const renderedSize = moduleSize * totalModules;
  const offsetX = x + (size - renderedSize) / 2;
  const offsetY = y + (size - renderedSize) / 2;

  roundedRect(ctx, x, y, size, size, 16);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.fillStyle = "#111";
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      ctx.fillRect(
        offsetX + (columnIndex + PROFILE_QR_QUIET_ZONE) * moduleSize,
        offsetY + (rowIndex + PROFILE_QR_QUIET_ZONE) * moduleSize,
        moduleSize,
        moduleSize,
      );
    });
  });
}

function drawSocialMark(
  ctx: CanvasRenderingContext2D,`,
  "canvas QR renderer",
);

component = replaceOnce(
  component,
  `  const canonicalUrl =
    model.accessTier === "member" && model.visibility === "public"
      ? \`akarihouse.com/profiles/\${model.username}\`
      : "Private AKARI profile";`,
  `  const canSharePublicProfile =
    model.accessTier === "member" && model.visibility === "public";
  const publicProfileUrl = canSharePublicProfile
    ? \`https://akarihouse.com/profiles/\${model.username}\`
    : "";
  const canonicalUrl = canSharePublicProfile
    ? publicProfileUrl.replace(/^https?:\\/\\//, "")
    : "Private AKARI profile";`,
  "canvas public URL",
);

const oldCanvasPanel = `  roundedRect(ctx, 1190, 260, 280, 310, 38);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = \`\${palette.accent}99\`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.font = "700 17px Inter, sans-serif";
  ctx.fillText("PROFILE LINK", 1230, 320);
  try {
    const flower = await loadImage("/assets/brand/akari-flower-mark.png");
    ctx.drawImage(flower, 1278, 345, 100, 100);
  } catch {
    // Brand mark is decorative here.
  }
  ctx.fillStyle = palette.ink;
  ctx.font = "650 21px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Connect on AKARI", 1330, 480);
  ctx.font = "500 15px Inter, sans-serif";
  ctx.globalAlpha = 0.72;
  ctx.fillText(canonicalUrl.slice(0, 34), 1330, 514);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";`;

const newCanvasPanel = `  roundedRect(ctx, 1190, 235, 280, 350, 38);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = \`\${palette.accent}99\`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  if (canSharePublicProfile) {
    drawProfileQr(ctx, publicProfileUrl, 1218, 255, 224);
    ctx.fillStyle = palette.accent;
    ctx.font = "800 15px Inter, sans-serif";
    ctx.fillText("SCAN TO CONNECT", 1330, 515);
    ctx.fillStyle = palette.ink;
    ctx.font = "650 18px Inter, sans-serif";
    ctx.fillText("AKARI PROFILE", 1330, 547);
    ctx.globalAlpha = 0.62;
    ctx.font = "500 13px Inter, sans-serif";
    ctx.fillText(canonicalUrl.slice(0, 34), 1330, 570);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = palette.accent;
    ctx.font = "800 17px Inter, sans-serif";
    ctx.fillText("PRIVATE PROFILE", 1330, 355);
    ctx.fillStyle = palette.ink;
    ctx.font = "650 19px Inter, sans-serif";
    ctx.fillText("Publish to enable QR", 1330, 405);
    ctx.globalAlpha = 0.64;
    ctx.font = "500 14px Inter, sans-serif";
    ctx.fillText("AKARI keeps private profiles private.", 1330, 442);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";`;
component = replaceOnce(component, oldCanvasPanel, newCanvasPanel, "canvas profile panel");

const oldCanvasSocials = `  ctx.fillStyle = palette.ink;
  ctx.font = "600 23px Inter, sans-serif";
  ctx.fillText("Connect with me", 165, 827);
  const visibleSocials = model.socials.slice(0, 6);
  visibleSocials.forEach((social, index) => {
    const circleX = 475 + index * 76;
    ctx.beginPath();
    ctx.arc(circleX, 817, 28, 0, Math.PI * 2);
    ctx.fillStyle = \`\${palette.ink}0d\`;
    ctx.fill();
    ctx.strokeStyle = \`\${palette.ink}45\`;
    ctx.stroke();
    drawSocialMark(ctx, social.platform, circleX - 12, 805, palette.ink);
  });`;

const newCanvasSocials = `  ctx.fillStyle = palette.ink;
  ctx.font = "600 23px Inter, sans-serif";
  ctx.fillText("Connect", 165, 827);
  const visibleSocials = model.socials.slice(0, CARD_SOCIAL_LIMIT);
  visibleSocials.forEach((social, index) => {
    const circleX = 430 + index * 92;
    ctx.beginPath();
    ctx.arc(circleX, 817, 30, 0, Math.PI * 2);
    ctx.fillStyle = \`\${palette.ink}0d\`;
    ctx.fill();
    ctx.strokeStyle = \`\${palette.ink}45\`;
    ctx.stroke();
    drawSocialMark(ctx, social.platform, circleX - 12, 805, palette.ink);
  });
  const hiddenSocialCount = model.socials.length - visibleSocials.length;
  if (hiddenSocialCount > 0) {
    const circleX = 430 + visibleSocials.length * 92;
    ctx.beginPath();
    ctx.arc(circleX, 817, 30, 0, Math.PI * 2);
    ctx.fillStyle = \`\${palette.ink}0d\`;
    ctx.fill();
    ctx.strokeStyle = \`\${palette.ink}45\`;
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    ctx.font = "700 18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(\`+\${hiddenSocialCount}\`, circleX, 823);
    ctx.textAlign = "left";
  }`;
component = replaceOnce(component, oldCanvasSocials, newCanvasSocials, "canvas socials");

component = replaceOnce(
  component,
  `  ctx.fillText("A private ecosystem for high-signal connections.", 1470, 925);`,
  `  ctx.fillText("A private membership for high-signal connections.", 1470, 925);`,
  "canvas footer copy",
);

component = replaceOnce(
  component,
  `  const canonicalUrl = canSharePublicProfile
    ? \`akarihouse.com/profiles/\${model.username}\`
    : "Private AKARI profile";`,
  `  const publicProfileUrl = canSharePublicProfile
    ? \`https://akarihouse.com/profiles/\${model.username}\`
    : "";
  const canonicalUrl = canSharePublicProfile
    ? publicProfileUrl.replace(/^https?:\\/\\//, "")
    : "Private AKARI profile";`,
  "component public URL",
);

component = replaceOnce(
  component,
  `          <p>
            A premium AKARI credit-card profile built from your real member
            data. Choose your glass color, control private details, then
            download or share.
          </p>`,
  `          <p>
            A shareable AKARI member card built from your live profile. Choose
            a finish, decide what stays public, then download or share.
          </p>`,
  "heading copy",
);

const oldProfilePanel = `              <div className="glass-profile-link" aria-label="Profile link">
                <span className="glass-profile-link-icon">
                  <LinkGlyph size={22} />
                </span>
                <small>Profile link</small>
                <strong>Connect on AKARI</strong>
                <span>{canonicalUrl}</span>
              </div>`;

const newProfilePanel = `              <div
                className={\`glass-profile-link\${
                  canSharePublicProfile ? " glass-profile-qr-panel" : " is-private"
                }\`}
                aria-label={
                  canSharePublicProfile
                    ? "Scan to view public AKARI profile"
                    : "Private AKARI profile"
                }
              >
                {canSharePublicProfile ? (
                  <>
                    <ProfileQrCode value={publicProfileUrl} />
                    <small>Scan to connect</small>
                    <strong>AKARI profile</strong>
                    <span className="glass-profile-qr-url">{canonicalUrl}</span>
                  </>
                ) : (
                  <>
                    <span className="glass-profile-link-icon">
                      <LinkGlyph size={22} />
                    </span>
                    <small>Private profile</small>
                    <strong>Publish to enable QR</strong>
                    <span>AKARI keeps private profiles private</span>
                  </>
                )}
              </div>`;
component = replaceOnce(component, oldProfilePanel, newProfilePanel, "live QR panel");

const oldSocialDom = `                {model.socials.length ? (
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
                )}`;

const newSocialDom = `                {model.socials.length ? (
                  <>
                    {model.socials
                      .slice(0, CARD_SOCIAL_LIMIT)
                      .map((social) => (
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
                    {model.socials.length > CARD_SOCIAL_LIMIT && (
                      <span
                        className="glass-social-more"
                        aria-label={\`\${model.socials.length - CARD_SOCIAL_LIMIT} more social profiles\`}
                      >
                        +{model.socials.length - CARD_SOCIAL_LIMIT}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="glass-no-socials">
                    Add social links to your profile
                  </span>
                )}`;
component = replaceOnce(component, oldSocialDom, newSocialDom, "social overflow");

component = replaceOnce(
  component,
  `<strong>Connect with me</strong>`,
  `<strong>Connect</strong>`,
  "connect label",
);

component = replaceOnce(
  component,
  `          <div className="glass-card-note">
            <strong>Credit-card format</strong>
            <span>
              85.6 × 54 proportion. The downloaded PNG uses the same branded
              glass design.
            </span>
          </div>`,
  `          <div className="glass-card-note">
            <strong>Built for sharing</strong>
            <span>
              {canSharePublicProfile
                ? "Export as PNG or scan the QR to open your public AKARI profile."
                : "Export as PNG. Publish your profile to enable a scannable QR."}
            </span>
          </div>`,
  "sharing note",
);

component = replaceOnce(
  component,
  `<legend>Card detail</legend>`,
  `<legend>Card style</legend>`,
  "control label",
);

writeFileSync(componentPath, component);

const enhancementPath = "app/styles/profile-card-enhancements.css";
let enhancements = readFileSync(enhancementPath, "utf8");
if (!enhancements.includes("/* R92: functional QR and calmer social sharing. */")) {
  enhancements += `

/* R92: functional QR and calmer social sharing. */
.glass-profile-qr-panel {
  top: 24% !important;
  right: 6.6% !important;
  width: 19.5% !important;
  min-height: 43% !important;
  padding: 1.05cqi !important;
  gap: 0.45cqi !important;
  background: color-mix(in srgb, var(--card-bg) 76%, var(--card-surface)) !important;
}

.glass-profile-qr {
  width: min(100%, 12cqi);
  aspect-ratio: 1;
  display: block;
  overflow: hidden;
  border-radius: clamp(5px, 0.95cqi, 9px);
  background: #fff;
  box-shadow:
    0 7px 18px rgb(0 0 0 / 24%),
    0 0 0 1px rgb(255 255 255 / 72%);
}

.glass-profile-qr-panel small {
  margin-top: 0.28cqi !important;
  color: var(--card-accent) !important;
  font-size: clamp(0.3rem, 0.78cqi, 0.4rem) !important;
  letter-spacing: 0.095em !important;
}

.glass-profile-qr-panel strong {
  font-size: clamp(0.36rem, 0.92cqi, 0.48rem) !important;
}

.glass-profile-qr-url {
  width: 100%;
  overflow: hidden;
  color: var(--card-ink);
  font-size: clamp(0.25rem, 0.58cqi, 0.32rem) !important;
  opacity: 0.58;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.glass-profile-link.is-private .glass-profile-link-icon {
  width: 36% !important;
  color: var(--card-ink) !important;
  background: color-mix(in srgb, var(--card-ink) 7%, transparent) !important;
  background-image: none !important;
  border: 1px solid color-mix(in srgb, var(--card-ink) 22%, transparent) !important;
  border-radius: 50% !important;
}

.glass-profile-link.is-private .glass-profile-link-icon::before,
.glass-profile-link.is-private .glass-profile-link-icon::after {
  display: none !important;
}

.glass-profile-link.is-private .glass-profile-link-icon svg {
  display: block !important;
  width: 46% !important;
  height: 46% !important;
}

.glass-connect-strip {
  width: 63.5% !important;
  padding-inline: 2.1cqi !important;
  gap: 1.45cqi !important;
}

.glass-connect-strip::after {
  left: 23% !important;
}

.glass-connect-strip > strong {
  width: 18% !important;
  flex-basis: 18% !important;
  font-size: clamp(0.46rem, 1.2cqi, 0.62rem) !important;
}

.glass-card-socials {
  gap: clamp(0.45rem, 1.3cqi, 0.72rem) !important;
}

.glass-card-socials a,
.glass-social-more {
  width: clamp(1.35rem, 4.45cqi, 1.78rem) !important;
  height: clamp(1.35rem, 4.45cqi, 1.78rem) !important;
  flex: 0 0 auto;
}

.glass-card-socials a {
  border-color: color-mix(in srgb, var(--card-ink) 38%, transparent) !important;
  background: color-mix(in srgb, var(--card-bg) 66%, transparent) !important;
}

.glass-card-socials svg {
  width: clamp(0.64rem, 1.75cqi, 0.78rem) !important;
  height: clamp(0.64rem, 1.75cqi, 0.78rem) !important;
}

.glass-social-more {
  display: grid;
  place-items: center;
  border: 1px dashed color-mix(in srgb, var(--card-ink) 38%, transparent);
  border-radius: 50%;
  color: var(--card-ink);
  background: color-mix(in srgb, var(--card-ink) 7%, transparent);
  font-size: clamp(0.38rem, 1.05cqi, 0.5rem);
  font-weight: 800;
}

.glass-card-footer::after {
  content: "A private membership for high-signal connections." !important;
}

@media (max-width: 700px) {
  .glass-profile-qr-panel {
    top: 27% !important;
    min-height: 37% !important;
    padding: 0.85cqi !important;
  }

  .glass-profile-qr {
    width: 11.5cqi !important;
  }

  .glass-profile-qr-panel small,
  .glass-profile-qr-panel strong {
    display: block !important;
  }

  .glass-profile-qr-url {
    display: none !important;
  }

  .glass-connect-strip {
    padding-inline: 1.7cqi !important;
    gap: 1.1cqi !important;
  }

  .glass-card-socials {
    gap: 0.85cqi !important;
  }

  .glass-card-socials a,
  .glass-social-more {
    width: 4.5cqi !important;
    height: 4.5cqi !important;
  }
}
`;
}
writeFileSync(enhancementPath, enhancements);

const unitPath = "tests/unit/profile-card-completion.test.ts";
let unit = readFileSync(unitPath, "utf8");
unit = replaceOnce(
  unit,
  `it("renders the requested credit-card identity and privacy features", () => {`,
  `it("renders the shareable identity, privacy and working QR features", () => {`,
  "unit test title",
);
unit = replaceOnce(
  unit,
  `    expect(component).toContain("Connected social platforms");`,
  `    expect(component).toContain("Connected social platforms");
    expect(component).toContain("buildProfileQrMatrix");
    expect(component).toContain("Scan to connect");
    expect(component).not.toContain("credit-card profile");
    expect(component).not.toContain("Credit-card format");`,
  "unit QR assertions",
);
unit = replaceOnce(
  unit,
  `    expect(styles).toContain("glass-card-gloss");`,
  `    expect(styles).toContain("glass-card-gloss");
    expect(component).toContain("glass-profile-qr");`,
  "unit QR style assertion",
);
writeFileSync(unitPath, unit);

const e2ePath = "tests/e2e/profile-card-events-r79.spec.ts";
let e2e = readFileSync(e2ePath, "utf8");
e2e = replaceOnce(
  e2e,
  `test("renders an optimized AKARI card workspace in credit-card proportions", async ({`,
  `test("renders an optimized AKARI sharing-card workspace", async ({`,
  "e2e title",
);
e2e = replaceOnce(
  e2e,
  `    await expect(card.locator('img[alt="AKARI"]')).toBeVisible();`,
  `    await expect(card.locator('img[alt="AKARI"]')).toBeVisible();
    const qr = card.locator(".glass-profile-qr");
    await expect(qr).toBeVisible();
    await expect(qr.locator("path")).toHaveAttribute("d", /M/);
    await expect(page.getByText("Scan to connect", { exact: true })).toBeVisible();`,
  "e2e QR assertions",
);
writeFileSync(e2ePath, e2e);
