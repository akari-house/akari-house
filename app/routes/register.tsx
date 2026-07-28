import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { AuthLayout } from "~/layouts/AuthLayout";
import { RoleSelector } from "~/components/RoleSelector";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { getOptionalUser } from "~/lib/auth.server";
import { hashPassword, assertSameOrigin } from "~/lib/security.server";
import { issueAccountToken } from "~/lib/account-tokens.server";
import {
  sendVerificationEmail,
  type MembershipEmailEnvironment,
} from "~/lib/email.server";
import {
  formText,
  normalizeEmail,
  normalizeUsername,
  selectedRoles,
  validateEmail,
  validateUsername,
} from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { roles } from "~/lib/domain";
import {
  verifyTurnstile,
  type TurnstileEnvironment,
} from "~/lib/turnstile.server";
import { consumeAuthLimit } from "~/lib/rate-limit.server";
import { legalAcceptanceStatements } from "~/lib/legal-consent.server";

type RegistrationEnvironment = CloudflareEnvironment &
  MembershipEmailEnvironment &
  TurnstileEnvironment & { TURNSTILE_SITE_KEY?: string };

export const meta: Route.MetaFunction = () => [
  { title: "Request Membership | AKARI House" },
  {
    name: "description",
    content:
      "Request reviewed AKARI House membership as a Founder, Creator, Investor or any combination of roles.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await getOptionalUser(request, context.get(cloudflareContext).env.DB))
    throw redirect("/app");
  const requestedRoles = new URL(request.url).searchParams.getAll("role");
  const selected = requestedRoles.filter(
    (role): role is (typeof roles)[number] =>
      roles.includes(role as (typeof roles)[number]),
  );
  const env = context.get(cloudflareContext).env as RegistrationEnvironment;
  return { selected, siteKey: env.TURNSTILE_SITE_KEY };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const env = context.get(cloudflareContext).env as RegistrationEnvironment;
  if (!(await verifyTurnstile(request, formData, env, "membership_request"))) {
    const errors: Record<string, string> = {
      form: "Complete the security check and try again.",
    };
    return {
      errors,
      values: {},
      selected: [],
    };
  }
  const email = normalizeEmail(formData.get("email"));
  const username = normalizeUsername(formData.get("username"));
  const displayName = formText(formData.get("displayName")).trim();
  const password = formText(formData.get("password"));
  const passwordConfirmation = formText(formData.get("passwordConfirmation"));
  const applicantNote = formText(formData.get("applicantNote")).trim();
  const legalTerms = formData.get("legalTerms") === "on";
  const selected = selectedRoles(formData);
  const errors: Record<string, string> = {};
  if (!validateEmail(email)) errors.email = "Enter a valid email address.";
  if (!validateUsername(username))
    errors.username = "Use 3 to 30 lowercase letters, numbers or hyphens.";
  if (displayName.length < 2 || displayName.length > 80)
    errors.displayName = "Enter a display name between 2 and 80 characters.";
  if (password.length < 12 || password.length > 128)
    errors.password = "Use 12 to 128 characters.";
  if (password !== passwordConfirmation)
    errors.passwordConfirmation = "The passwords do not match.";
  if (applicantNote.length < 30 || applicantNote.length > 600)
    errors.applicantNote =
      "Tell us what brings you to AKARI in 30 to 600 characters.";
  if (!legalTerms)
    errors.legalTerms =
      "Agree to the Terms and Community Guidelines and acknowledge the Privacy Notice.";
  if (selected.length === 0) errors.roles = "Select at least one role.";
  if (Object.keys(errors).length)
    return {
      errors,
      values: {
        email,
        username,
        displayName,
        applicantNote,
        legalTerms,
      },
      selected,
    };

  const db = context.get(cloudflareContext).env.DB;
  if (!(await consumeAuthLimit(db, request, "register", email, 3, 60)))
    return redirect("/membership/check-email");
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .bind(email, username)
    .first();
  if (existing) return redirect("/membership/check-email");

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const legalAcceptances = await legalAcceptanceStatements(db, request, userId);
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO users (id, email, username, password_hash, status) VALUES (?, ?, ?, ?, 'restricted')",
        )
        .bind(userId, email, username, passwordHash),
      db
        .prepare(
          "INSERT INTO profiles (user_id, display_name, visibility) VALUES (?, ?, 'private')",
        )
        .bind(userId, displayName),
      db
        .prepare(
          "INSERT INTO profile_visibility (user_id, visibility) VALUES (?, 'private')",
        )
        .bind(userId),
      ...selected.map((role) =>
        db
          .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
          .bind(userId, role),
      ),
      ...selected.map((role) =>
        db
          .prepare(
            `INSERT INTO role_verifications (user_id, role, status)
             VALUES (?, ?, 'pending')`,
          )
          .bind(userId, role),
      ),
      db
        .prepare(
          "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id) VALUES (?, ?, 'account.registered', 'user', ?)",
        )
        .bind(crypto.randomUUID(), userId, userId),
      ...legalAcceptances,
      db
        .prepare(
          "INSERT INTO membership_applications (id, user_id, status, applicant_note) VALUES (?, ?, 'pending_email', ?)",
        )
        .bind(crypto.randomUUID(), userId, applicantNote),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique constraint")
    )
      return redirect("/membership/check-email");
    throw error;
  }
  const token = await issueAccountToken(db, userId, "email_verification");
  const delivery = await sendVerificationEmail(env, email, token);
  await db
    .prepare(
      "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, ?, 'membership_application', ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      userId,
      delivery.sent
        ? "membership.verification_sent"
        : "membership.verification_pending",
      userId,
      JSON.stringify({ delivery: delivery.sent ? "sent" : delivery.reason }),
    )
    .run();
  return redirect("/membership/check-email");
}

export default function Register({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  return (
    <AuthLayout eyebrow="Membership desk" title="Request a place in the House">
      <p className="form-intro">
        Every request is reviewed by a person. Applying does not create member
        access immediately, and your profile begins private.
      </p>
      <Form method="post" className="form-stack">
        {actionData?.errors.form && (
          <p className="form-error" role="alert">
            {actionData.errors.form}
          </p>
        )}
        <label>
          Display name
          <input
            name="displayName"
            autoComplete="name"
            defaultValue={actionData?.values.displayName}
            required
            aria-invalid={Boolean(actionData?.errors.displayName)}
            aria-describedby={
              actionData?.errors.displayName ? "display-name-error" : undefined
            }
          />
        </label>
        {actionData?.errors.displayName && (
          <small id="display-name-error" className="field-error">
            {actionData.errors.displayName}
          </small>
        )}
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            defaultValue={actionData?.values.username}
            placeholder="your-name"
            required
            aria-invalid={Boolean(actionData?.errors.username)}
            aria-describedby={
              actionData?.errors.username ? "username-error" : undefined
            }
          />
        </label>
        {actionData?.errors.username && (
          <small id="username-error" className="field-error">
            {actionData.errors.username}
          </small>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={actionData?.values.email}
            required
            aria-invalid={Boolean(actionData?.errors.email)}
            aria-describedby={
              actionData?.errors.email ? "email-error" : undefined
            }
          />
        </label>
        {actionData?.errors.email && (
          <small id="email-error" className="field-error">
            {actionData.errors.email}
          </small>
        )}
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            aria-invalid={Boolean(actionData?.errors.password)}
            aria-describedby={
              actionData?.errors.password ? "password-error" : undefined
            }
          />
        </label>
        {actionData?.errors.password && (
          <small id="password-error" className="field-error">
            {actionData.errors.password}
          </small>
        )}
        <label>
          Confirm password
          <input
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            aria-invalid={Boolean(actionData?.errors.passwordConfirmation)}
            aria-describedby={
              actionData?.errors.passwordConfirmation
                ? "password-confirmation-error"
                : undefined
            }
          />
        </label>
        {actionData?.errors.passwordConfirmation && (
          <small id="password-confirmation-error" className="field-error">
            {actionData.errors.passwordConfirmation}
          </small>
        )}
        <RoleSelector
          selected={actionData?.selected ?? loaderData.selected}
          errorId={actionData?.errors.roles ? "roles-error" : undefined}
        />
        {actionData?.errors.roles && (
          <small id="roles-error" className="field-error">
            {actionData.errors.roles}
          </small>
        )}
        <label>
          What brings you to AKARI?
          <textarea
            name="applicantNote"
            rows={5}
            minLength={30}
            maxLength={600}
            defaultValue={actionData?.values.applicantNote}
            placeholder="Share what you are building, creating or investing in, and how you hope to participate."
            required
            aria-invalid={Boolean(actionData?.errors.applicantNote)}
            aria-describedby={
              actionData?.errors.applicantNote
                ? "applicant-note-error"
                : undefined
            }
          />
        </label>
        {actionData?.errors.applicantNote && (
          <small id="applicant-note-error" className="field-error">
            {actionData.errors.applicantNote}
          </small>
        )}
        <label className="consent-row">
          <input
            name="legalTerms"
            type="checkbox"
            required
            defaultChecked={actionData?.values.legalTerms}
            aria-invalid={Boolean(actionData?.errors.legalTerms)}
            aria-describedby={
              actionData?.errors.legalTerms ? "legal-terms-error" : undefined
            }
          />
          <span>
            I agree to the <Link to="/terms">Terms</Link> and{" "}
            <Link to="/community-guidelines">Community Guidelines</Link>. I
            acknowledge that I have read the{" "}
            <Link to="/privacy">Privacy Notice</Link>. I understand that
            submitting this form does not guarantee membership.
          </span>
        </label>
        {actionData?.errors.legalTerms && (
          <small id="legal-terms-error" className="field-error">
            {actionData.errors.legalTerms}
          </small>
        )}
        <TurnstileWidget
          siteKey={loaderData.siteKey}
          action="membership_request"
        />
        <button
          className="button button-primary button-wide"
          disabled={pending}
          type="submit"
        >
          {pending ? "Sending request..." : "Send membership request"}
        </button>
      </Form>
      <p className="form-footer">
        Already a member? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
