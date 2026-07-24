const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 5 * 1024 * 1024;

export function productionSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self' https://challenges.cloudflare.com",
      "upgrade-insecure-requests",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export function validateImageUpload(file: File) {
  if (!allowedImageTypes.has(file.type)) {
    return { ok: false as const, error: "Use a JPEG, PNG or WebP image." };
  }
  if (file.size <= 0 || file.size > maxImageBytes) {
    return {
      ok: false as const,
      error: "Image files must be larger than 0 bytes and no more than 5 MB.",
    };
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
  return { ok: true as const, safeName: safeName || "upload" };
}

export function isSafeReturnPath(value: string | null | undefined) {
  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !value.includes("\u0000"),
  );
}

export function clientAddress(request: Request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function recordSecurityEvent(
  db: D1Database,
  request: Request,
  eventType: string,
  outcome: "allowed" | "blocked" | "failed",
  actorUserId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await db
    .prepare(
      `INSERT INTO security_events
       (id, actor_user_id, event_type, outcome, ip_address, user_agent, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      actorUserId ?? null,
      eventType,
      outcome,
      clientAddress(request),
      request.headers.get("User-Agent")?.slice(0, 500) ?? "",
      JSON.stringify(metadata ?? {}),
    )
    .run();
}
