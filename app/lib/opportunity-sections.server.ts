import {
  opportunitySectionDefinitions,
  type OpportunitySectionKey,
} from "./opportunity-sections";

export type OpportunitySectionRow = {
  id: string;
  sectionKey: OpportunitySectionKey;
  title: string;
  body: string;
  visibility: "public" | "confidential";
  status: "draft" | "submitted" | "published" | "declined" | "archived";
  sortOrder: number;
  decisionNote: string;
  updatedAt: string;
};

export async function loadOpportunitySections(
  db: D1Database,
  projectId: string,
  options: { includeDrafts?: boolean; includeConfidential?: boolean } = {},
) {
  const statuses = options.includeDrafts
    ? "('draft', 'submitted', 'published', 'declined')"
    : "('published')";
  const visibility = options.includeConfidential
    ? ""
    : "AND visibility = 'public'";
  const result = await db
    .prepare(
      `SELECT id, section_key AS sectionKey, title, body, visibility, status,
              sort_order AS sortOrder, decision_note AS decisionNote,
              updated_at AS updatedAt
       FROM opportunity_sections
       WHERE project_id = ? AND status IN ${statuses} ${visibility}
       ORDER BY sort_order, created_at`,
    )
    .bind(projectId)
    .all<OpportunitySectionRow>();
  return result.results;
}

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOpportunitySections(
  db: D1Database,
  projectId: string,
  userId: string,
  form: FormData,
  submit: boolean,
) {
  const statements: D1PreparedStatement[] = [];
  let populated = 0;

  for (const [index, definition] of opportunitySectionDefinitions.entries()) {
    const body = text(form, `section.${definition.key}.body`);
    const visibilityValue = text(form, `section.${definition.key}.visibility`);
    const visibility = visibilityValue === "public" ? "public" : "confidential";
    if (body.length > 8000)
      throw new Response(`${definition.title} is too long.`, { status: 400 });
    if (body) populated += 1;
    statements.push(
      db
        .prepare(
          `INSERT INTO opportunity_sections
             (id, project_id, section_key, title, body, visibility, status,
              sort_order, created_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(project_id, section_key) DO UPDATE SET
             title = excluded.title,
             body = excluded.body,
             visibility = excluded.visibility,
             status = excluded.status,
             sort_order = excluded.sort_order,
             reviewed_by = NULL,
             reviewed_at = NULL,
             decision_note = '',
             updated_at = datetime('now')`,
        )
        .bind(
          crypto.randomUUID(),
          projectId,
          definition.key,
          definition.title,
          body,
          visibility,
          submit ? "submitted" : "draft",
          index,
          userId,
        ),
    );
  }

  if (submit && populated < 4)
    throw new Response(
      "Complete at least four Deal Room sections before submitting them for review.",
      { status: 400 },
    );

  await db.batch(statements);
}

export async function publishSubmittedOpportunitySections(
  db: D1Database,
  projectId: string,
  reviewerId: string,
  decisionNote: string,
) {
  await db
    .prepare(
      `UPDATE opportunity_sections
       SET status = 'published', reviewed_by = ?, reviewed_at = datetime('now'),
           decision_note = ?, updated_at = datetime('now')
       WHERE project_id = ? AND status = 'submitted' AND trim(body) <> ''`,
    )
    .bind(reviewerId, decisionNote, projectId)
    .run();
}
