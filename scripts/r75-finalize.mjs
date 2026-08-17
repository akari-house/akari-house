import fs from "node:fs";

function replaceRequired(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`R75 patch marker missing: ${label}`);
  return text.replace(from, to);
}

const workspacePath = "app/routes/admin-saas-workspaces.tsx";
let workspace = fs.readFileSync(workspacePath, "utf8");
workspace = replaceRequired(
  workspace,
  'import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";\n',
  'import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";\nimport { sendWorkspaceInvitationEmail } from "~/lib/email.server";\n',
  "workspace email import",
);
workspace = replaceRequired(
  workspace,
  'import { formText, normalizeEmail, validateEmail } from "~/lib/validation";\n',
  'import { formText, normalizeEmail, validateEmail } from "~/lib/validation";\nimport {\n  issueWorkspaceInvitationToken,\n  markWorkspaceInvitationDelivery,\n} from "~/lib/workspace-invitations.server";\n',
  "workspace invitation imports",
);
workspace = replaceRequired(
  workspace,
  '  const db = context.get(cloudflareContext).env.DB;\n  const admin = await requireSuperAdmin(request, db);',
  '  const env = context.get(cloudflareContext).env;\n  const db = env.DB;\n  const admin = await requireSuperAdmin(request, db);',
  "workspace action env",
);
workspace = replaceRequired(
  workspace,
  '"SELECT id, owner_user_id AS ownerUserId FROM saas_workspaces WHERE id = ?",',
  '"SELECT id, name, owner_user_id AS ownerUserId FROM saas_workspaces WHERE id = ?",',
  "workspace name query",
);
workspace = replaceRequired(
  workspace,
  '.first<{ id: string; ownerUserId: string }>();',
  '.first<{ id: string; name: string; ownerUserId: string }>();',
  "workspace query type",
);
workspace = replaceRequired(
  workspace,
  'if (!userId || !isWorkspaceRole(role))\n      return { error: "Choose a user and workspace role." };',
  'if (!userId || !isWorkspaceRole(role) || role === "owner")\n      return { error: "Choose a user and a non-owner workspace role." };',
  "prevent second owner through add-member",
);
workspace = replaceRequired(
  workspace,
  '      !isWorkspaceRole(role) ||\n      !["active", "suspended"].includes(status)',
  '      !isWorkspaceRole(role) ||\n      (role === "owner" && userId !== workspace.ownerUserId) ||\n      !["active", "suspended"].includes(status)',
  "prevent second owner through update-member",
);
workspace = workspace.replace(
  '"Workspace owner must remain an active owner. Transfer ownership before changing this member.",',
  '"Workspace owner must remain an active owner. Use Transfer ownership first.",',
);

if (!workspace.includes('intent === "transfer-owner"')) {
  const marker = '  if (intent === "record-invite") {';
  const block = `  if (intent === "transfer-owner") {
    const newOwnerUserId = formText(form.get("newOwnerUserId")).trim();
    if (!newOwnerUserId || newOwnerUserId === workspace.ownerUserId)
      return { error: "Choose a different active workspace member." };
    const candidate = await db
      .prepare(
        "SELECT role, status FROM saas_workspace_members WHERE workspace_id = ? AND user_id = ?",
      )
      .bind(workspaceId, newOwnerUserId)
      .first<{ role: string; status: string }>();
    if (!candidate || candidate.status !== "active")
      return { error: "The new owner must already be an active workspace member." };
    await db.batch([
      db
        .prepare(
          "UPDATE saas_workspace_members SET role = 'admin', updated_at = datetime('now') WHERE workspace_id = ? AND user_id = ?",
        )
        .bind(workspaceId, workspace.ownerUserId),
      db
        .prepare(
          "UPDATE saas_workspace_members SET role = 'owner', status = 'active', updated_at = datetime('now') WHERE workspace_id = ? AND user_id = ?",
        )
        .bind(workspaceId, newOwnerUserId),
      db
        .prepare(
          "UPDATE saas_workspaces SET owner_user_id = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(newOwnerUserId, admin.id, workspaceId),
      db
        .prepare(
          "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, 'saas_workspace.owner_transferred', 'saas_workspace', ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          admin.id,
          workspaceId,
          JSON.stringify({ fromUserId: workspace.ownerUserId, toUserId: newOwnerUserId }),
        ),
    ]);
    return { saved: true, message: "Workspace ownership transferred." };
  }

`;
  if (!workspace.includes(marker)) throw new Error("R75 record-invite marker missing");
  workspace = workspace.replace(marker, block + marker);
}

const oldInvite = `    await db
      .prepare(
        "INSERT INTO saas_workspace_invitations (id, workspace_id, email, role, expires_at, invited_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(crypto.randomUUID(), workspaceId, email, role, expiresAt, admin.id)
      .run();
    return {
      saved: true,
      message:
        "Invitation is tracked. No email is sent automatically in this release.",
    };`;
if (!workspace.includes("issueWorkspaceInvitationToken(db, invitationId)")) {
  if (!workspace.includes(oldInvite)) throw new Error("R75 invitation action marker missing");
  const newInvite = `    const invitationId = crypto.randomUUID();
    await db
      .prepare(
        \`INSERT INTO saas_workspace_invitations
         (id, workspace_id, email, role, expires_at, invited_by)
         VALUES (?, ?, ?, ?, COALESCE(datetime(?, '+1 day', '-1 second'), datetime('now', '+7 days')), ?)\`,
      )
      .bind(invitationId, workspaceId, email, role, expiresAt, admin.id)
      .run();
    const token = await issueWorkspaceInvitationToken(db, invitationId);
    const delivery = await sendWorkspaceInvitationEmail(
      env,
      email,
      token,
      workspace.name,
      role,
    );
    if (delivery.sent || delivery.deliveryId)
      await markWorkspaceInvitationDelivery(
        db,
        invitationId,
        delivery.deliveryId ?? null,
      );
    await db
      .prepare(
        "INSERT INTO audit_logs (id, actor_user_id, action, subject_type, subject_id, metadata_json) VALUES (?, ?, 'saas_workspace.invitation_created', 'saas_workspace', ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        workspaceId,
        JSON.stringify({
          invitationId,
          email,
          role,
          delivery: delivery.sent ? "delivered" : delivery.reason,
        }),
      )
      .run();
    return {
      saved: true,
      message: delivery.sent
        ? "Workspace invitation sent."
        : delivery.reason === "queued"
          ? "Workspace invitation queued for delivery."
          : "Invitation created, but email delivery is not configured.",
    };`;
  workspace = workspace.replace(oldInvite, newInvite);
}

workspace = workspace.replace(
  '<select name="role" defaultValue="member">\n                  {workspaceRoles.map((r) => (',
  '<select name="role" defaultValue="member">\n                  {workspaceRoles.filter((r) => r !== "owner").map((r) => (',
);
workspace = workspace.replace(
  `              <h3>Invitation tracking</h3>
              <p>
                This records pending invitations only. It does not pretend an
                email/token delivery system exists.
              </p>`,
  `              <h3>Workspace invitations</h3>
              <p>
                Invitations use a single-use secure token and the invited email must
                match the signed-in AKARI account.
              </p>`,
);
workspace = workspace.replace(
  '<button disabled={pending}>Track invitation</button>',
  '<button disabled={pending}>Send invitation</button>',
);
if (!workspace.includes('value="transfer-owner"')) {
  const marker = '              <h3>Workspace invitations</h3>';
  const block = `              <h3>Ownership</h3>
              <Form method="post" className="inline-form">
                <input type="hidden" name="intent" value="transfer-owner" />
                <input type="hidden" name="workspaceId" value={selected.id} />
                <select name="newOwnerUserId" defaultValue="" required>
                  <option value="" disabled>Transfer ownership to...</option>
                  {loaderData.members
                    .filter(
                      (member) =>
                        member.status === "active" &&
                        member.userId !== selected.ownerUserId,
                    )
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.label}
                      </option>
                    ))}
                </select>
                <button disabled={pending}>Transfer ownership</button>
              </Form>
`;
  if (!workspace.includes(marker)) throw new Error("R75 invitation UI marker missing");
  workspace = workspace.replace(marker, block + marker);
}
fs.writeFileSync(workspacePath, workspace);

const routesPath = "app/routes.ts";
let routes = fs.readFileSync(routesPath, "utf8");
if (!routes.includes("workspace-invitations/accept")) {
  routes = replaceRequired(
    routes,
    '  route("workspaces/:slug", "routes/saas-workspace.tsx"),',
    '  route("workspaces/:slug", "routes/saas-workspace.tsx"),\n  route("workspace-invitations/accept", "routes/workspace-invitation-accept.tsx"),',
    "workspace invitation route",
  );
}
fs.writeFileSync(routesPath, routes);

const loginPath = "app/routes/login.tsx";
let login = fs.readFileSync(loginPath, "utf8");
if (!login.includes("invitationReturn")) {
  login = replaceRequired(
    login,
    `  const destination = firstEntry
    ? "/app?welcome=1"
    : returnTo?.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/app";`,
    `  const safeReturnTo =
    returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;
  const invitationReturn = safeReturnTo?.startsWith(
    "/workspace-invitations/accept",
  );
  const destination = invitationReturn
    ? safeReturnTo!
    : firstEntry
      ? "/app?welcome=1"
      : safeReturnTo ?? "/app";`,
    "invite-aware login return",
  );
}
fs.writeFileSync(loginPath, login);
