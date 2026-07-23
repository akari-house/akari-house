import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/membership-check-email";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { AuthLayout } from "~/layouts/AuthLayout";
import { issueAccountToken } from "~/lib/account-tokens.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  sendVerificationEmail,
  type MembershipEmailEnvironment,
} from "~/lib/email.server";
import { assertSameOrigin } from "~/lib/security.server";
import {
  verifyTurnstile,
  type TurnstileEnvironment,
} from "~/lib/turnstile.server";
import { normalizeEmail } from "~/lib/validation";
import { consumeAuthLimit } from "~/lib/rate-limit.server";

type ResendEnvironment = CloudflareEnvironment &
  MembershipEmailEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export function meta() {
  return [{ title: "Check your email | AKARI House" }];
}

export function loader({ context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env as ResendEnvironment;
  return { siteKey: env.TURNSTILE_SITE_KEY };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const env = context.get(cloudflareContext).env as ResendEnvironment;
  if (!(await verifyTurnstile(request, formData, env, "resend_verification")))
    return { error: "Complete the security check and try again." };
  const email = normalizeEmail(formData.get("email"));
  if (
    !(await consumeAuthLimit(
      env.DB,
      request,
      "resend_verification",
      email,
      3,
      30,
    ))
  )
    return { sent: true };
  const user = await env.DB.prepare(
    `SELECT u.id, u.email
     FROM users u JOIN membership_applications ma ON ma.user_id = u.id
     WHERE u.email = ? AND ma.status = 'pending_email'`,
  )
    .bind(email)
    .first<{ id: string; email: string }>();
  if (user) {
    const recent = await env.DB.prepare(
      `SELECT id FROM account_tokens
       WHERE user_id = ? AND purpose = 'email_verification'
         AND created_at > datetime('now', '-1 minute')`,
    )
      .bind(user.id)
      .first();
    if (!recent) {
      const token = await issueAccountToken(
        env.DB,
        user.id,
        "email_verification",
      );
      await sendVerificationEmail(env, user.email, token);
    }
  }
  return { sent: true };
}

export default function MembershipCheckEmail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <AuthLayout
      eyebrow="Application received"
      title="Confirm where we can reach you"
    >
      <div className="status-card" role="status">
        <span className="status-mark" aria-hidden="true">
          Light
        </span>
        <h2>Check your inbox</h2>
        <p>
          Use the confirmation link in the message from AKARI House. Your
          request enters human review only after your email is confirmed.
        </p>
        <p>
          The link expires after 24 hours. If no message arrives, check your
          spam folder before requesting another confirmation.
        </p>
      </div>
      <Form method="post" className="form-stack resend-form">
        <h2>Send another confirmation</h2>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.sent && (
          <p className="notice success" role="status">
            If an application is waiting for confirmation, we have sent a new
            link.
          </p>
        )}
        <label>
          Application email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <TurnstileWidget
          siteKey={loaderData.siteKey}
          action="resend_verification"
        />
        <button
          className="button button-quiet button-wide"
          disabled={navigation.state !== "idle"}
        >
          {navigation.state === "idle"
            ? "Send another confirmation"
            : "Sending confirmation..."}
        </button>
      </Form>
      <p className="form-footer">
        Already approved? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
