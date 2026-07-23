import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { AuthLayout } from "~/layouts/AuthLayout";
import { createSession, getOptionalUser } from "~/lib/auth.server";
import { assertSameOrigin, verifyPassword } from "~/lib/security.server";
import { formText, normalizeEmail } from "~/lib/validation";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await getOptionalUser(request, context.get(cloudflareContext).env.DB))
    throw redirect("/app");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const formData = await request.formData();
  const email = normalizeEmail(formData.get("email"));
  const password = formText(formData.get("password"));
  const db = context.get(cloudflareContext).env.DB;
  const row = await db
    .prepare(
      "SELECT id, password_hash AS passwordHash, status FROM users WHERE email = ?",
    )
    .bind(email)
    .first<{ id: string; passwordHash: string; status: string }>();
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
  const cookie = await createSession(db, row.id, request);
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  const destination =
    returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/app";
  return redirect(destination, { headers: { "Set-Cookie": cookie } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  return (
    <AuthLayout eyebrow="Welcome back" title="Return to the House">
      <p className="form-intro">
        Your rooms, roles and privacy choices are waiting.
      </p>
      <Form method="post" className="form-stack">
        {actionData?.error && <p className="form-error">{actionData.error}</p>}
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
            required
          />
        </label>
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
