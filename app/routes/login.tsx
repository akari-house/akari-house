import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { AuthLayout } from "~/layouts/AuthLayout";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { createSession, getOptionalUser } from "~/lib/auth.server";
import { assertSameOrigin, verifyPassword } from "~/lib/security.server";
import { formText, normalizeEmail } from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  verifyTurnstile,
  type TurnstileEnvironment,
} from "~/lib/turnstile.server";
import { consumeAuthLimit } from "~/lib/rate-limit.server";

type LoginEnvironment = CloudflareEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await getOptionalUser(request, context.get(cloudflareContext).env.DB))
    throw redirect("/app");
  const env = context.get(cloudflareContext).env as LoginEnvironment;
  return { siteKey: env.TURNSTILE_SITE_KEY };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const env = context.get(cloudflareContext).env as LoginEnvironment;
  if (!(await verifyTurnstile(request, formData, env, "login")))
    return { error: "Complete the security check and try again.", email: "" };
  const email = normalizeEmail(formData.get("email"));
  const password = formText(formData.get("password"));
  const db = context.get(cloudflareContext).env.DB;
  if (!(await consumeAuthLimit(db, request, "login", email, 8, 15)))
    return {
      error: "Too many login attempts. Wait a little before trying again.",
      email,
    };
  const row = await db
    .prepare(
      "SELECT id, password_hash AS passwordHash, status, onboarding_started_at AS onboardingStartedAt FROM users WHERE email = ?",
    )
    .bind(email)
    .first<{
      id: string;
      passwordHash: string;
      status: string;
      onboardingStartedAt: string | null;
    }>();
  if (!row || !(await verifyPassword(password, row.passwordHash))) {
    return { error: "The email or password was not recognized.", email };
  }
  if (row.status !== "active") {
    return {
      error:
        "Your membership request does not have member access yet. Check the latest message from the Membership Desk.",
      email,
      membershipPending: true,
    };
  }
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
  return (
    <AuthLayout eyebrow="Welcome back" title="Return to the House">
      <p className="form-intro">
        Your rooms, roles and privacy choices are waiting.
      </p>
      <Form method="post" className="form-stack">
        {actionData?.error && (
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
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <Link className="form-assist-link" to="/forgot-password">
          Forgot password?
        </Link>
        <TurnstileWidget siteKey={loaderData.siteKey} action="login" />
        <button
          className="button button-primary button-wide"
          disabled={navigation.state !== "idle"}
          type="submit"
        >
          Log in
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
