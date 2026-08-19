import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const optimizedDir = "public/assets/optimized";
const brandDir = "public/assets/brand";

await mkdir(optimizedDir, { recursive: true });
await mkdir(brandDir, { recursive: true });

const hero = `${optimizedDir}/arrival.webp`;

await Promise.all([
  sharp(hero)
    .resize({ width: 960, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(`${optimizedDir}/arrival-960.webp`),
  sharp(hero)
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(`${optimizedDir}/arrival-1440.webp`),
]);

const mark = `${brandDir}/akari-mark.png`;
const background = { r: 9, g: 11, b: 20, alpha: 1 };

await Promise.all([
  sharp(mark)
    .resize(64, 64, { fit: "contain", background })
    .png({ compressionLevel: 9 })
    .toFile(`${brandDir}/favicon.png`),
  sharp(mark)
    .resize(180, 180, { fit: "contain", background })
    .png({ compressionLevel: 9 })
    .toFile(`${brandDir}/apple-touch-icon.png`),
  sharp(mark)
    .resize(192, 192, { fit: "contain", background })
    .png({ compressionLevel: 9 })
    .toFile(`${brandDir}/app-icon-192.png`),
  sharp(mark)
    .resize(512, 512, { fit: "contain", background })
    .png({ compressionLevel: 9 })
    .toFile(`${brandDir}/app-icon-512.png`),
  sharp(mark)
    .resize(400, 400, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({ top: 56, bottom: 56, left: 56, right: 56, background })
    .png({ compressionLevel: 9 })
    .toFile(`${brandDir}/app-icon-maskable-512.png`),
]);
