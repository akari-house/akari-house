import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/register";
import { AuthLayout } from "~/layouts/AuthLayout";
import { RoleSelector } from "~/components/RoleSelector";
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

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await getOptionalUser(request, context.get(cloudflareContext).env.DB))
    throw redirect("/app");
  const requestedRoles = new URL(request.url).searchParams.getAll("role");
  const selected = requestedRoles.filter(
    (role): role is (typeof roles)[number] =>
      roles.includes(role as (typeof roles)[number]),
  );
  return { selected };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const email = normalizeEmail(formData.get("email"));
  const username = normalizeUsername(formData.get("username"));
  const displayName = formText(formData.get("displayName")).trim();
  const password = formText(formData.get("password"));
  const applicantNote = formText(formData.get("applicantNote")).trim();
  const membershipTerms = formData.get("membershipTerms") === "on";
  const selected = selectedRoles(formData);
  const errors: Record<string, string> = {};
  if (!validateEmail(email)) errors.email = "Enter a valid email address.";
  if (!validateUsername(username))
    errors.username = "Use 3 to 30 lowercase letters, numbers or hyphens.";
  if (displayName.length < 2 || displayName.length > 80)
    errors.displayName = "Enter a display name between 2 and 80 characters.";
  if (password.length < 12) errors.password = "Use at least 12 characters.";
  if (applicantNote.length < 30 || applicantNote.length > 600)
    errors.applicantNote =
      "Tell us what brings you to AKARI in 30 to 600 characters.";
  if (!membershipTerms)
    errors.membershipTerms = "Confirm that you understand the review process.";
  if (selected.length === 0) errors.roles = "Select at least one role.";
  if (Object.keys(errors).length)
    return {
      errors,
      values: { email, username, displayName, applicantNote },
      selected,
    };

  const db = context.get(cloudflareContext).env.DB;
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .bind(email, username)
    .first();
  if (existing)
    return {
      errors: {
        form: "If these details can continue, we will send the next step.",
      },
      values: { email, username, displayName, applicantNote },
      selected,
    };

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
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
    db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id) VALUES (?, ?, 'account.registered', 'user', ?)",
      )
      .bind(crypto.randomUUID(), userId, userId),
    db
      .prepare(
        "INSERT INTO membership_applications (id, user_id, status, applicant_note) VALUES (?, ?, 'pending_email', ?)",
      )
      .bind(crypto.randomUUID(), userId, applicantNote),
  ]);
  const token = await issueAccountToken(db, userId, "email_verification");
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    MembershipEmailEnvironment;
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
          <p className="form-error">{actionData.errors.form}</p>
        )}
        <label>
          Display name
          <input
            name="displayName"
            autoComplete="name"
            defaultValue={actionData?.values.displayName}
            required
          />
        </label>
        {actionData?.errors.displayName && (
          <small className="field-error">{actionData.errors.displayName}</small>
        )}
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            defaultValue={actionData?.values.username}
            placeholder="your-name"
            required
          />
        </label>
        {actionData?.errors.username && (
          <small className="field-error">{actionData.errors.username}</small>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={actionData?.values.email}
            required
          />
        </label>
        {actionData?.errors.email && (
          <small className="field-error">{actionData.errors.email}</small>
        )}
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        {actionData?.errors.password && (
          <small className="field-error">{actionData.errors.password}</small>
        )}
        <RoleSelector selected={actionData?.selected ?? loaderData.selected} />
        {actionData?.errors.roles && (
          <small className="field-error">{actionData.errors.roles}</small>
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
          />
        </label>
        {actionData?.errors.applicantNote && (
          <small className="field-error">
            {actionData.errors.applicantNote}
          </small>
        )}
        <label className="consent-row">
          <input name="membershipTerms" type="checkbox" required />
          <span>
            I understand that AKARI reviews every request and that submitting
            this form does not guarantee membership.
          </span>
        </label>
        {actionData?.errors.membershipTerms && (
          <small className="field-error">
            {actionData.errors.membershipTerms}
          </small>
        )}
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
