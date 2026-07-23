export function withSecurityHeaders(request: Request, response: Response) {
  const secured = new Response(response.body, response);
  const headers = secured.headers;
  const url = new URL(request.url);
  const isLocalDevelopment =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";
  const contentType = headers.get("Content-Type") ?? "";

  if (contentType.toLowerCase() === "text/html") {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  if (contentType.toLowerCase().startsWith("text/html")) {
    headers.set("Cache-Control", "private, no-store");
    headers.append("Vary", "Cookie");
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "img-src 'self' data:",
      "font-src 'self' https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `script-src 'self' 'unsafe-inline'${isLocalDevelopment ? " 'unsafe-eval'" : ""}`,
      `connect-src 'self'${isLocalDevelopment ? " ws:" : ""}`,
    ].join("; "),
  );
  if (url.protocol === "https:") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return secured;
}
