import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { AuthLayout } from "~/layouts/AuthLayout";
import { issueAccountToken } from "~/lib/account-tokens.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  sendPasswordResetEmail,
  type MembershipEmailEnvironment,
} from "~/lib/email.server";
import { assertSameOrigin } from "~/lib/security.server";
import {
  verifyTurnstile,
  type TurnstileEnvironment,
} from "~/lib/turnstile.server";
import { normalizeEmail } from "~/lib/validation";
import { consumeAuthLimit } from "~/lib/rate-limit.server";

type RecoveryEnvironment = CloudflareEnvironment &
  MembershipEmailEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export function loader({ context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env as RecoveryEnvironment;
  return { siteKey: env.TURNSTILE_SITE_KEY };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const env = context.get(cloudflareContext).env as RecoveryEnvironment;
  if (!(await verifyTurnstile(request, formData, env, "forgot_password")))
    return { error: "Complete the security check and try again." };

  const email = normalizeEmail(formData.get("email"));
  const db = env.DB;
  if (!(await consumeAuthLimit(db, request, "forgot", email, 3, 30)))
    return { sent: true };
  const user = await db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string }>();
  if (user) {
    const token = await issueAccountToken(db, user.id, "password_reset");
    await sendPasswordResetEmail(env, user.email, token);
  }
  return { sent: true };
}

export default function ForgotPassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <AuthLayout eyebrow="Account recovery" title="Find your way back">
      {actionData?.sent ? (
        <div className="status-card" role="status">
          <h2>Check your inbox</h2>
          <p>
            If an account can use password recovery, a reset link is on its way.
          </p>
          <Link className="button button-quiet button-wide" to="/login">
            Return to login
          </Link>
        </div>
      ) : (
        <>
          <p className="form-intro">
            Enter the email connected to your AKARI account.
          </p>
          <Form method="post" className="form-stack">
            {actionData?.error && (
              <p className="form-error" role="alert">
                {actionData.error}
              </p>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <TurnstileWidget
              siteKey={loaderData.siteKey}
              action="forgot_password"
            />
            <button
              className="button button-primary button-wide"
              disabled={navigation.state !== "idle"}
            >
              {navigation.state === "idle"
                ? "Send reset link"
                : "Sending reset link..."}
            </button>
          </Form>
        </>
      )}
    </AuthLayout>
  );
}
