export type ProjectManagerAccess = "owner" | "collaborator";

export async function projectManagerAccess(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<ProjectManagerAccess | null> {
  const row = await db
    .prepare(
      `SELECT CASE
      WHEN pr.founder_user_id = ? THEN 'owner'
      ELSE 'collaborator'
    END AS access
       FROM projects pr
       LEFT JOIN project_collaborators pc
         ON pc.project_id = pr.id AND pc.user_id = ?
       WHERE pr.id = ?
         AND (pr.founder_user_id = ? OR pc.user_id IS NOT NULL)
       LIMIT 1`,
    )
    .bind(userId, userId, projectId, userId)
    .first<{ access: ProjectManagerAccess }>();
  return row?.access ?? null;
}

export async function userCanManageProject(
  db: D1Database,
  projectId: string,
  userId: string,
) {
  return Boolean(await projectManagerAccess(db, projectId, userId));
}

export async function requireProjectManagerBySlug(
  db: D1Database,
  slug: string | undefined,
  userId: string,
) {
  const project = await db
    .prepare(
      `SELECT pr.id AS projectId, pr.slug,
    pr.founder_user_id AS ownerUserId,
    CASE
      WHEN pr.founder_user_id = ? THEN 'owner'
      ELSE 'collaborator'
    END AS access
       FROM projects pr
       LEFT JOIN project_collaborators pc
         ON pc.project_id = pr.id AND pc.user_id = ?
       WHERE pr.slug = ?
         AND (pr.founder_user_id = ? OR pc.user_id IS NOT NULL)
       LIMIT 1`,
    )
    .bind(userId, userId, slug, userId)
    .first<{
      projectId: string;
      slug: string;
      ownerUserId: string;
      access: ProjectManagerAccess;
    }>();
  if (!project) throw new Response("Project not found.", { status: 404 });
  return project;
}
