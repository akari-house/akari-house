import { createSession } from "./auth.server";
import {
  publicLoginFallbackResponse,
  publicLoginRelease,
} from "./public-login-fallback.server";
import { consumeAuthLimit } from "./rate-limit.server";
import { assertSameOrigin, verifyPassword } from "./security.server";
import { verifyTurnstile, type TurnstileEnvironment } from "./turnstile.server";
import { formText, normalizeEmail, validateEmail } from "./validation";

export type PublicLoginEnvironment = CloudflareEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

type LoginStage =
  | "request"
  | "security"
  | "rate-limit"
  | "account"
  | "password"
  | "session"
  | "unexpected";

export function isPublicLoginRequest(request: Request) {
  return new URL(request.url).pathname === "/login";
}

function loginResponse(
  request: Request,
  env: PublicLoginEnvironment,
  error: string,
  email = "",
  status = 200,
  stage: LoginStage = "unexpected",
) {
  return publicLoginFallbackResponse(request, env.TURNSTILE_SITE_KEY, {
    error,
    email,
    status,
    stage,
  });
}

function safeReturnTo(request: Request) {
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  return returnTo?.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/app";
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

  let email = "";

  try {
    let formData: FormData;
    try {
      assertSameOrigin(request);
      formData = await request.formData();
      email = normalizeEmail(formData.get("email"));
    } catch (error) {
      console.error("Public login request validation failed.", error);
      return loginResponse(
        request,
        env,
        "Refresh the page and try signing in again.",
        email,
        403,
        "request",
      );
    }

    const password = formText(formData.get("password"));
    if (!validateEmail(email) || password.length === 0)
      return loginResponse(
        request,
        env,
        "Enter a valid email address and password.",
        email,
        400,
        "request",
      );

    let turnstilePassed = false;
    try {
      turnstilePassed = await verifyTurnstile(request, formData, env, "login");
    } catch (error) {
      console.error("Public login security verification failed.", error);
      return loginResponse(
        request,
        env,
        "The security check could not be verified. Refresh the page and try again.",
        email,
        503,
        "security",
      );
    }
    if (!turnstilePassed)
      return loginResponse(
        request,
        env,
        "Complete the security check and try again.",
        email,
        403,
        "security",
      );

    const db = env.DB;
    try {
      if (!(await consumeAuthLimit(db, request, "login", email, 8, 15)))
        return loginResponse(
          request,
          env,
          "Too many login attempts. Wait a little before trying again.",
          email,
          429,
          "rate-limit",
        );
    } catch (error) {
      console.error("Public login rate-limit check failed.", error);
      return loginResponse(
        request,
        env,
        "Login protection is temporarily unavailable. Please try again in a moment.",
        email,
        503,
        "rate-limit",
      );
    }

    let row:
      | {
          id: string;
          passwordHash: string;
          status: string;
          emailVerifiedAt: string | null;
        }
      | null;
    try {
      row = await db
        .prepare(
          "SELECT id, password_hash AS passwordHash, status, email_verified_at AS emailVerifiedAt FROM users WHERE email = ?",
        )
        .bind(email)
        .first<{
          id: string;
          passwordHash: string;
          status: string;
          emailVerifiedAt: string | null;
        }>();
    } catch (error) {
      console.error("Public login account lookup failed.", error);
      return loginResponse(
        request,
        env,
        "The account service is temporarily unavailable. Please try again in a moment.",
        email,
        503,
        "account",
      );
    }

    if (!row)
      return loginResponse(
        request,
        env,
        "The email or password was not recognised.",
        email,
        401,
        "account",
      );

    let passwordMatches = false;
    try {
      passwordMatches = await verifyPassword(password, row.passwordHash);
    } catch (error) {
      console.error("Public login password verification failed.", error);
      return loginResponse(
        request,
        env,
        "Password verification is temporarily unavailable. Please try again in a moment.",
        email,
        503,
        "password",
      );
    }

    if (!passwordMatches)
      return loginResponse(
        request,
        env,
        "The email or password was not recognised.",
        email,
        401,
        "password",
      );

    if (row.status === "suspended")
      return loginResponse(
        request,
        env,
        "This account is not available. Contact the Membership Desk.",
        email,
        403,
        "account",
      );

    if (!row.emailVerifiedAt)
      return loginResponse(
        request,
        env,
        "Confirm your email before signing in.",
        email,
        403,
        "account",
      );

    let cookie: string;
    try {
      cookie = await createSession(db, row.id, request);
    } catch (error) {
      console.error("Public login session creation failed.", error);
      return loginResponse(
        request,
        env,
        "A secure session could not be created. Please try again in a moment.",
        email,
        503,
        "session",
      );
    }

    try {
      await db
        .prepare(
          "UPDATE users SET onboarding_started_at = COALESCE(onboarding_started_at, datetime('now')) WHERE id = ?",
        )
        .bind(row.id)
        .run();
    } catch (error) {
      console.error("Non-blocking onboarding marker update failed.", error);
    }

    return new Response(null, {
      status: 303,
      headers: {
        Location: safeReturnTo(request),
        "Set-Cookie": cookie,
        "Cache-Control": "no-store",
        "X-AKARI-Login-Release": publicLoginRelease,
        "X-AKARI-Login-Result": "success",
        "X-AKARI-Login-Stage": "complete",
      },
    });
  } catch (error) {
    console.error("Unexpected public login failure.", error);
    return loginResponse(
      request,
      env,
      "Sign-in could not be completed. Please refresh the page and try again.",
      email,
      503,
      "unexpected",
    );
  }
}
