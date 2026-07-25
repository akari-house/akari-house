import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [mode, inputPath, outputPath] = process.argv.slice(2);
if (
  !mode ||
  !inputPath ||
  !outputPath ||
  !["encrypt", "decrypt"].includes(mode)
) {
  throw new Error(
    "Usage: node backup-crypto.mjs <encrypt|decrypt> <input> <output>",
  );
}

const encodedKey = process.env.RECOVERY_BACKUP_ENCRYPTION_KEY?.trim();
if (!encodedKey) throw new Error("RECOVERY_BACKUP_ENCRYPTION_KEY is required.");
const key = Buffer.from(encodedKey, "base64");
if (key.byteLength !== 32)
  throw new Error("RECOVERY_BACKUP_ENCRYPTION_KEY must decode to 32 bytes.");

const magic = Buffer.from("AKARI-D1-BACKUP-V1\0", "utf8");

if (mode === "encrypt") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(magic);
  const encrypted = Buffer.concat([
    cipher.update(await readFile(inputPath)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  await writeFile(outputPath, Buffer.concat([magic, iv, tag, encrypted]));
} else {
  const input = await readFile(inputPath);
  if (!input.subarray(0, magic.length).equals(magic))
    throw new Error("Backup header is invalid.");
  const ivStart = magic.length;
  const tagStart = ivStart + 12;
  const bodyStart = tagStart + 16;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    input.subarray(ivStart, tagStart),
  );
  decipher.setAAD(magic);
  decipher.setAuthTag(input.subarray(tagStart, bodyStart));
  const decrypted = Buffer.concat([
    decipher.update(input.subarray(bodyStart)),
    decipher.final(),
  ]);
  await writeFile(outputPath, decrypted);
}
