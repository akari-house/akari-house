import { createSession } from "./auth.server";
import { publicLoginFallbackResponse } from "./public-login-fallback.server";
import { consumeAuthLimit } from "./rate-limit.server";
import { assertSameOrigin, verifyPassword } from "./security.server";
import { verifyTurnstile, type TurnstileEnvironment } from "./turnstile.server";
import { formText, normalizeEmail } from "./validation";

export type PublicLoginEnvironment = CloudflareEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export function isPublicLoginRequest(request: Request) {
  return new URL(request.url).pathname === "/login";
}

function loginResponse(
  request: Request,
  env: PublicLoginEnvironment,
  error: string,
  email = "",
  status = 200,
) {
  return publicLoginFallbackResponse(request, env.TURNSTILE_SITE_KEY, {
    error,
    email,
    status,
  });
}

export async function handlePublicLoginRequest(
  request: Request,
  env: PublicLoginEnvironment,
): Promise<Response> {
  if (request.method === "GET")
    return publicLoginFallbackResponse(request, env.TURNSTILE_SITE_KEY);

  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });

  let formData: FormData;
  try {
    assertSameOrigin(request);
    formData = await request.formData();
  } catch (error) {
    console.error("Public login request validation failed.", error);
    return loginResponse(
      request,
      env,
      "Refresh the page and try signing in again.",
      "",
      403,
    );
  }

  const email = normalizeEmail(formData.get("email"));
  const password = formText(formData.get("password"));

  try {
    if (!(await verifyTurnstile(request, formData, env, "login")))
      return loginResponse(
        request,
        env,
        "Complete the security check and try again.",
        email,
      );

    const db = env.DB;
    if (!(await consumeAuthLimit(db, request, "login", email, 8, 15)))
      return loginResponse(
        request,
        env,
        "Too many login attempts. Wait a little before trying again.",
        email,
        429,
      );

    const row = await db
      .prepare(
        "SELECT id, password_hash AS passwordHash, status, email_verified_at AS emailVerifiedAt, onboarding_started_at AS onboardingStartedAt FROM users WHERE email = ?",
      )
      .bind(email)
      .first<{
        id: string;
        passwordHash: string;
        status: string;
        emailVerifiedAt: string | null;
        onboardingStartedAt: string | null;
      }>();

    if (!row || !(await verifyPassword(password, row.passwordHash)))
      return loginResponse(
        request,
        env,
        "The email or password was not recognised.",
        email,
        401,
      );

    if (row.status === "suspended")
      return loginResponse(
        request,
        env,
        "This account is not available. Contact the Membership Desk.",
        email,
        403,
      );

    if (!row.emailVerifiedAt)
      return loginResponse(
        request,
        env,
        "Confirm your email before signing in.",
        email,
        403,
      );

    const firstEntry = !row.onboardingStartedAt;
    if (firstEntry)
      await db
        .prepare(
          "UPDATE users SET onboarding_started_at = datetime('now') WHERE id = ? AND onboarding_started_at IS NULL",
        )
        .bind(row.id)
        .run();

    const cookie = await createSession(db, row.id, request);
    const returnTo = new URL(request.url).searchParams.get("returnTo");
    const destination = firstEntry
      ? "/app?welcome=1"
      : returnTo?.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/app";

    return new Response(null, {
      status: 303,
      headers: {
        Location: destination,
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
        "X-AKARI-Login-Result": "success",
      },
    });
  } catch (error) {
    console.error("Public login submission failed.", error);
    return loginResponse(
      request,
      env,
      "The Membership Desk could not complete sign-in. Please try again in a moment.",
      email,
      503,
    );
  }
}
