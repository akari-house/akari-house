import { validateProfilePhoto } from "./profile-photo.server";

const MAX_EVENT_IMAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  );
}

function safeImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.includes(":") ||
    isPrivateIpv4(hostname)
  )
    return null;
  return url;
}

async function readBoundedBody(response: Response) {
  if (!response.body) throw new Error("The image response was empty.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > MAX_EVENT_IMAGE_BYTES)
        throw new Error("The linked image is larger than 2 MB.");
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function importEventImage(source: string) {
  let url = safeImageUrl(source);
  if (!url)
    throw new Error(
      "Use a public HTTPS image URL. Private-network and local links are not allowed.",
    );

  let response: Response | null = null;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/jpeg,image/png,image/webp" },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("The image redirect was incomplete.");
    url = safeImageUrl(new URL(location, url).toString());
    if (!url) throw new Error("The image redirected to an unsafe address.");
    response = null;
  }
  if (!response) throw new Error("The image redirected too many times.");
  if (!response.ok)
    throw new Error("The linked image could not be downloaded.");
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_EVENT_IMAGE_BYTES)
    throw new Error("The linked image is larger than 2 MB.");
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType ?? ""))
    throw new Error(
      "The link must point directly to a JPG, PNG or WebP image.",
    );

  const bytes = await readBoundedBody(response);
  const file = new File([bytes], "event-cover", {
    type: contentType,
  });
  const validated = await validateProfilePhoto(file);
  if (!validated)
    throw new Error("The linked file is not a valid JPG, PNG or WebP image.");
  return {
    bytes,
    contentType: validated.contentType,
    extension: validated.extension,
    sourceUrl: url.toString(),
  };
}
