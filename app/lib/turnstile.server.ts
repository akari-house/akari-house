import { formText } from "./validation";

export interface TurnstileEnvironment {
  APP_ENV?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAME?: string;
}

interface TurnstileResult {
  success: boolean;
  action?: string;
  hostname?: string;
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

export async function verifyTurnstile(
  request: Request,
  formData: FormData,
  env: TurnstileEnvironment,
  expectedAction: string,
) {
  if (!env.TURNSTILE_SECRET_KEY && isLocalRequest(request)) return true;
  if (env.APP_ENV === "development" && !env.TURNSTILE_SECRET_KEY) return true;
  const token = formText(formData.get("cf-turnstile-response"));
  if (!env.TURNSTILE_SECRET_KEY || !token || token.length > 2048) return false;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
          idempotency_key: crypto.randomUUID(),
        }),
      },
    );
    if (!response.ok) return false;
    const result: TurnstileResult = await response.json();
    const hostnameIsValid =
      env.APP_ENV !== "production" ||
      (Boolean(env.TURNSTILE_HOSTNAME) &&
        result.hostname === env.TURNSTILE_HOSTNAME);
    return (
      result.success && result.action === expectedAction && hostnameIsValid
    );
  } catch {
    return false;
  }
}
