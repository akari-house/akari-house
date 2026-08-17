import { sha256 } from "./security.server";

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function issueWorkspaceInvitationToken(
  db: D1Database,
  invitationId: string,
) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await db
    .prepare(
      `UPDATE saas_workspace_invitations
       SET token_hash = ?, sent_at = NULL, delivery_id = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(tokenHash, invitationId)
    .run();
  return token;
}

export async function findValidWorkspaceInvitation(
  db: D1Database,
  token: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT i.id, i.workspace_id AS workspaceId, w.slug AS workspaceSlug,
              w.name AS workspaceName, i.email, i.role, i.status,
              i.expires_at AS expiresAt
       FROM saas_workspace_invitations i
       JOIN saas_workspaces w ON w.id = i.workspace_id
       WHERE i.token_hash = ? AND i.status = 'pending'
         AND (i.expires_at IS NULL OR i.expires_at > datetime('now'))
         AND w.status NOT IN ('closed', 'suspended')
       LIMIT 1`,
    )
    .bind(await sha256(token))
    .first<{
      id: string;
      workspaceId: string;
      workspaceSlug: string;
      workspaceName: string;
      email: string;
      role: "admin" | "finance" | "member";
      status: string;
      expiresAt: string | null;
    }>();
}

export async function markWorkspaceInvitationDelivery(
  db: D1Database,
  invitationId: string,
  deliveryId: string | null,
) {
  await db
    .prepare(
      `UPDATE saas_workspace_invitations
       SET sent_at = datetime('now'), delivery_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(deliveryId, invitationId)
    .run();
}
