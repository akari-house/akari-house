import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/workspace-invitation-accept";
import { AuthLayout } from "~/layouts/AuthLayout";
import { getOptionalUser, requireUser } from "~/lib/auth.server";
import { loadWorkspaceEntitlements } from "~/lib/saas-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { findValidWorkspaceInvitation } from "~/lib/workspace-invitations.server";

export const meta: Route.MetaFunction = () => [
  { title: "Workspace invitation | AKARI" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const invitation = await findValidWorkspaceInvitation(db, token);
  if (!invitation)
    return {
      invitation: null,
      token: "",
      user: await getOptionalUser(request, db),
      loginUrl: "/login",
      emailMatches: false,
    };
  const user = await getOptionalUser(request, db);
  const returnTo = `${url.pathname}${url.search}`;
  const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  const userEmail = user
    ? await db
        .prepare("SELECT email FROM users WHERE id = ?")
        .bind(user.id)
        .first<{ email: string }>()
    : null;
  return {
    invitation,
    token,
    user,
    loginUrl,
    emailMatches:
      Boolean(userEmail?.email) &&
      userEmail!.email.trim().toLowerCase() === invitation.email.toLowerCase(),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);
  const form = await request.formData();
  const token = formText(form.get("token")).trim();
  const invitation = await findValidWorkspaceInvitation(db, token);
  if (!invitation)
    return { error: "This workspace invitation is no longer valid." };
  const account = await db
    .prepare("SELECT email FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ email: string }>();
  if (
    !account ||
    account.email.trim().toLowerCase() !== invitation.email.trim().toLowerCase()
  )
    return {
      error: `Sign in with the invited email address ${invitation.email}.`,
    };

  const existing = await db
    .prepare(
      "SELECT status FROM saas_workspace_members WHERE workspace_id = ? AND user_id = ?",
    )
    .bind(invitation.workspaceId, user.id)
    .first<{ status: string }>();
  const effective = await loadWorkspaceEntitlements(db, invitation.workspaceId);
  if (!existing || existing.status !== "active") {
    const active = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM saas_workspace_members WHERE workspace_id = ? AND status = 'active'",
      )
      .bind(invitation.workspaceId)
      .first<{ count: number }>();
    if (Number(active?.count ?? 0) >= effective.seatLimit)
      return {
        error:
          "This workspace has reached its seat limit. Ask the workspace owner to increase the plan limit.",
      };
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO saas_workspace_members
         (workspace_id, user_id, role, status, invited_by, updated_at)
         VALUES (?, ?, ?, 'active', NULL, datetime('now'))
         ON CONFLICT(workspace_id, user_id) DO UPDATE SET
           role = excluded.role, status = 'active', updated_at = datetime('now')`,
      )
      .bind(invitation.workspaceId, user.id, invitation.role),
    db
      .prepare(
        `UPDATE saas_workspace_invitations
         SET status = 'accepted', accepted_by_user_id = ?, accepted_at = datetime('now'),
             token_hash = NULL, updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(user.id, invitation.id),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'saas_workspace.invitation_accepted', 'saas_workspace', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        invitation.workspaceId,
        JSON.stringify({ invitationId: invitation.id, role: invitation.role }),
      ),
  ]);
  return redirect(`/workspaces/${invitation.workspaceSlug}`);
}

export default function WorkspaceInvitationAccept({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  if (!loaderData.invitation)
    return (
      <AuthLayout
        eyebrow="Workspace invitation"
        title="This invitation is unavailable"
      >
        <p className="form-intro">
          It may have expired, been revoked, or already been accepted.
        </p>
        <Link className="button button-primary button-wide" to="/app">
          Return to AKARI
        </Link>
      </AuthLayout>
    );

  return (
    <AuthLayout
      eyebrow="Workspace invitation"
      title={`Join ${loaderData.invitation.workspaceName}`}
    >
      <p className="form-intro">
        You were invited as <strong>{loaderData.invitation.role}</strong> using{" "}
        <strong>{loaderData.invitation.email}</strong>.
      </p>
      {!loaderData.user ? (
        <>
          <p>
            Sign in with the invited email address to accept this workspace
            seat.
          </p>
          <Link
            className="button button-primary button-wide"
            to={loaderData.loginUrl}
          >
            Sign in to accept
          </Link>
        </>
      ) : !loaderData.emailMatches ? (
        <p className="form-error" role="alert">
          This signed-in account does not match the invitation email. Sign out
          and use {loaderData.invitation.email}.
        </p>
      ) : (
        <Form method="post" className="form-stack">
          <input type="hidden" name="token" value={loaderData.token} />
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <button className="button button-primary button-wide" type="submit">
            Accept workspace invitation
          </button>
        </Form>
      )}
    </AuthLayout>
  );
}
