import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { AuthLayout } from "~/layouts/AuthLayout";
import { PasswordField } from "~/components/PasswordField";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { createSession } from "~/lib/auth.server";
import { assertSameOrigin, verifyPassword } from "~/lib/security.server";
import { formText, normalizeEmail } from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  verifyTurnstile,
  type TurnstileEnvironment,
} from "~/lib/turnstile.server";
import { consumeAuthLimit } from "~/lib/rate-limit.server";

export type LoginEnvironment = CloudflareEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export function getLoginPageData(context: Route.LoaderArgs["context"]): {
  siteKey?: string;
} {
  try {
    const env = context.get(cloudflareContext).env as LoginEnvironment;
    return { siteKey: env.TURNSTILE_SITE_KEY };
  } catch (error) {
    console.error(
      "Login page environment lookup failed; rendering without Turnstile until the binding is restored.",
      error,
    );
    return { siteKey: undefined };
  }
}

export function loader({ context }: Route.LoaderArgs) {
  return getLoginPageData(context);
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const env = context.get(cloudflareContext).env as LoginEnvironment;
  if (!(await verifyTurnstile(request, formData, env, "login")))
    return {
      error: "Complete the security check and try again.",
      errorField: "form" as const,
      email: "",
    };
  const email = normalizeEmail(formData.get("email"));
  const password = formText(formData.get("password"));
  const db = context.get(cloudflareContext).env.DB;
  if (!(await consumeAuthLimit(db, request, "login", email, 8, 15)))
    return {
      error: "Too many login attempts. Wait a little before trying again.",
      errorField: "form" as const,
      email,
    };
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
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return {
      error: "The email or password was not recognized.",
      errorField: "credentials" as const,
      email,
    };
  }
  if (row.status === "suspended") {
    return {
      error: "This account is not available. Contact the Membership Desk.",
      errorField: "form" as const,
      email,
    };
  }
  if (!row.emailVerifiedAt)
    return {
      error: "Confirm your email before signing in.",
      errorField: "form" as const,
      email,
      membershipPending: true,
    };
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
  return redirect(destination, { headers: { "Set-Cookie": cookie } });
}

export default function Login({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const credentialError =
    actionData?.errorField === "credentials" ? actionData.error : undefined;

  return (
    <AuthLayout eyebrow="Welcome back" title="Return to the House">
      <p className="form-intro">
        Your rooms, roles and privacy choices are waiting.
      </p>
      <Form method="post" className="form-stack" noValidate={false}>
        {actionData?.error && actionData.errorField !== "credentials" && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={actionData?.email}
            required
            aria-invalid={Boolean(credentialError)}
          />
        </label>
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          maxLength={128}
          hint="Passwords are case-sensitive. Use Show to check what you typed."
          error={credentialError}
        />
        <Link className="form-assist-link" to="/forgot-password">
          Forgot password?
        </Link>
        <TurnstileWidget siteKey={loaderData.siteKey} action="login" />
        <button
          className="button button-primary button-wide"
          disabled={pending}
          type="submit"
        >
          {pending ? "Signing in..." : "Log in"}
        </button>
      </Form>
      <p className="form-footer">
        New to AKARI? <Link to="/register">Request membership</Link>
      </p>
      {actionData?.membershipPending && (
        <p className="form-footer">
          Need help?{" "}
          <Link to="/membership/check-email">View the application guide</Link>
        </p>
      )}
    </AuthLayout>
  );
}
