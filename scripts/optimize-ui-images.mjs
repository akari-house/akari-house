import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const publicDir = path.join(root, "public", "assets");

await mkdir(path.join(publicDir, "optimized"), { recursive: true });
await mkdir(path.join(publicDir, "case-studies", "thumbs"), {
  recursive: true,
});

await Promise.all([
  sharp(path.join(publicDir, "brand", "akari-logo.png"))
    .resize({ width: 360, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6, alphaQuality: 90 })
    .toFile(path.join(publicDir, "optimized", "akari-logo.webp")),
  sharp(path.join(publicDir, "brand", "akari-mark.png"))
    .resize({ width: 160, withoutEnlargement: true })
    .webp({ quality: 84, effort: 6, alphaQuality: 90 })
    .toFile(path.join(publicDir, "optimized", "akari-mark.webp")),
  sharp(path.join(publicDir, "house", "arrival-v3.webp"))
    .webp({ quality: 76, effort: 6, smartSubsample: true })
    .toFile(path.join(publicDir, "optimized", "arrival.webp")),
]);

const thumbnails = [
  ["gameon-1.png", "gameon-forge.webp"],
  ["alphablockz-1.png", "alphablockz-ecosystem.webp"],
  ["ads-1.png", "performance-acquisition.webp"],
  ["coral-growth-1.png", "coralapp-community-growth.webp"],
  ["coral-mindshare-1.png", "coralapp-ct-mindshare.webp"],
];

await Promise.all(
  thumbnails.map(([source, output]) =>
    sharp(path.join(publicDir, "case-studies", source))
      .resize(720, 450, { fit: "cover", position: "attention" })
      .webp({ quality: 78, effort: 6, smartSubsample: true })
      .toFile(path.join(publicDir, "case-studies", "thumbs", output)),
  ),
);
