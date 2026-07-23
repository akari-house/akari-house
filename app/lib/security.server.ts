import { scrypt, timingSafeEqual } from "node:crypto";

const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const derivedKeyLength = 32;

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password,
      salt,
      derivedKeyLength,
      {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParallelization,
        maxmem: 32 * 1024 * 1024,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(new Uint8Array(key));
      },
    );
  });
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt);
  return `scrypt$${scryptCost}$${scryptBlockSize}$${scryptParallelization}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] =
    stored.split("$");
  if (
    algorithm !== "scrypt" ||
    Number(cost) !== scryptCost ||
    Number(blockSize) !== scryptBlockSize ||
    Number(parallelization) !== scryptParallelization ||
    !saltValue ||
    !hashValue
  )
    return false;
  const expected = base64ToBytes(hashValue);
  const actual = await derivePassword(password, base64ToBytes(saltValue));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(digest));
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new Response("Invalid request origin", { status: 403 });
}

export function safeEqualText(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
