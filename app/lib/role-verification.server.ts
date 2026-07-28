import type { Role } from "./domain";

type RoleVerificationRow = {
  role: Role;
  status: "pending" | "verified" | "declined" | "revoked";
  hasProvenance: number;
  hasCurrentProvenance: number;
  eligible: number;
};

export function effectiveRoleVerificationStatus(row: RoleVerificationRow) {
  return row.eligible === 0
    ? ("revoked" as const)
    : row.status === "verified" &&
        (row.hasProvenance === 0 || row.hasCurrentProvenance === 1)
      ? ("verified" as const)
      : row.status === "verified"
        ? ("expired" as const)
        : row.status;
}

export async function roleVerificationStates(db: D1Database, userId: string) {
  const rows = await db
    .prepare(
      `SELECT rv.role, rv.status,
              CASE WHEN u.status = 'active' AND ma.status = 'approved'
                THEN 1 ELSE 0 END AS eligible,
              CASE WHEN EXISTS (
                SELECT 1 FROM verification_provenance vp
                WHERE vp.user_id = rv.user_id AND vp.role = rv.role
              ) THEN 1 ELSE 0 END AS hasProvenance,
              CASE WHEN EXISTS (
                SELECT 1 FROM verification_provenance vp
                WHERE vp.user_id = rv.user_id AND vp.role = rv.role
                  AND vp.status = 'active'
                  AND (vp.review_due_at IS NULL OR vp.review_due_at > datetime('now'))
              ) THEN 1 ELSE 0 END AS hasCurrentProvenance
       FROM role_verifications rv
       JOIN user_roles ur
         ON ur.user_id = rv.user_id AND ur.role = rv.role
       JOIN users u ON u.id = rv.user_id
       LEFT JOIN membership_applications ma ON ma.user_id = rv.user_id
       WHERE rv.user_id = ?
       ORDER BY rv.role`,
    )
    .bind(userId)
    .all<RoleVerificationRow>();

  return rows.results.map((row) => ({
    role: row.role,
    status: effectiveRoleVerificationStatus(row),
  }));
}

export async function isRoleVerifiedId(
  db: D1Database,
  userId: string,
  role: Role,
) {
  const account = await db
    .prepare(
      `SELECT 1
       FROM users u
       JOIN membership_applications ma ON ma.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = ?
       WHERE u.id = ? AND u.status = 'active' AND ma.status = 'approved'`,
    )
    .bind(role, userId)
    .first();
  if (!account) return false;

  return (await roleVerificationStates(db, userId)).some(
    (state) => state.role === role && state.status === "verified",
  );
}

export async function verifiedRolesForUser(db: D1Database, userId: string) {
  const states = await roleVerificationStates(db, userId);
  return states
    .filter((state) => state.status === "verified")
    .map((state) => state.role);
}

export function roleVerificationClaimStatements(
  db: D1Database,
  userId: string,
  previousRoles: Role[],
  nextRoles: Role[],
) {
  const removed = previousRoles.filter((role) => !nextRoles.includes(role));
  const added = nextRoles.filter((role) => !previousRoles.includes(role));
  const statements: D1PreparedStatement[] = [];

  for (const role of removed) {
    statements.push(
      db
        .prepare(
          `UPDATE role_verifications
           SET status = 'revoked', reviewed_by = NULL, reviewed_at = NULL,
               decision_note = 'Role removed by member',
               updated_at = datetime('now')
           WHERE user_id = ? AND role = ?`,
        )
        .bind(userId, role),
      db
        .prepare(
          `UPDATE verification_provenance
           SET status = 'revoked', updated_at = datetime('now')
           WHERE user_id = ? AND role = ? AND status = 'active'`,
        )
        .bind(userId, role),
    );
  }

  for (const role of added) {
    statements.push(
      db
        .prepare(
          `INSERT INTO role_verifications
             (user_id, role, status, reviewed_by, reviewed_at, decision_note, updated_at)
           VALUES (?, ?, 'pending', NULL, NULL, '', datetime('now'))
           ON CONFLICT(user_id, role) DO UPDATE SET
             status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
             decision_note = '', updated_at = datetime('now')`,
        )
        .bind(userId, role),
    );
  }

  return statements;
}
