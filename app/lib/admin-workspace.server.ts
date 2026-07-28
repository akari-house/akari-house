import {
  adminScopes,
  type AdminAccessLevel,
  type AdminScope,
  type AdminWorkspaceAccess,
} from "./admin-workspace";

export async function loadOptionalAdminWorkspaceAccess(
  db: D1Database,
  userId: string,
): Promise<AdminWorkspaceAccess | undefined> {
  try {
    const row = await db
      .prepare(
        `SELECT au.access_level AS accessLevel,
                group_concat(scopes.scope, ',') AS scopesCsv
         FROM admin_users au
         LEFT JOIN admin_scopes scopes ON scopes.admin_user_id = au.user_id
         WHERE au.user_id = ?
         GROUP BY au.user_id`,
      )
      .bind(userId)
      .first<{
        accessLevel: AdminAccessLevel;
        scopesCsv: string | null;
      }>();
    if (!row) return undefined;

    const scopes =
      row.accessLevel === "superadmin"
        ? adminScopes
        : (row.scopesCsv ?? "")
            .split(",")
            .filter((scope): scope is AdminScope =>
              adminScopes.includes(scope as AdminScope),
            );

    return { accessLevel: row.accessLevel, scopes };
  } catch (error) {
    console.warn(
      "Optional admin navigation lookup failed; continuing without admin links.",
      error,
    );
    return undefined;
  }
}

export async function loadAdminWorkspaceAccess(
  db: D1Database,
  userId: string,
): Promise<AdminWorkspaceAccess> {
  const access = await loadOptionalAdminWorkspaceAccess(db, userId);
  if (!access)
    throw new Response("Admin permission required.", { status: 403 });
  return access;
}
