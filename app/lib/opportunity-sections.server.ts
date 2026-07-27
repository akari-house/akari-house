export const opportunitySectionDefinitions = [
  {
    key: "problem_solution",
    title: "Problem and solution",
    description: "The problem, the proposed solution and why the approach matters.",
  },
  {
    key: "product_demo",
    title: "Product and demo",
    description: "Product maturity, current experience and an approved demo context.",
  },
  {
    key: "market_competition",
    title: "Market and competition",
    description: "Target market, alternatives, positioning and competitive risks.",
  },
  {
    key: "business_model",
    title: "Business model",
    description: "Revenue model, customers, pricing and commercial assumptions.",
  },
  {
    key: "traction",
    title: "Traction",
    description: "Evidence of adoption, revenue, pilots, retention or other progress.",
  },
  {
    key: "team",
    title: "Team",
    description: "Relevant team background, responsibilities and key hiring needs.",
  },
  {
    key: "raise_information",
    title: "Raise information",
    description: "Current raise structure, timing and material terms approved for review.",
  },
  {
    key: "use_of_funds",
    title: "Use of funds",
    description: "Planned allocation, milestones and expected runway.",
  },
  {
    key: "tokenomics",
    title: "Tokenomics",
    description: "Token design and distribution where relevant; otherwise leave blank.",
  },
  {
    key: "risk_information",
    title: "Risk information",
    description: "Material technical, commercial, regulatory and execution risks.",
  },
] as const;

export type OpportunitySectionKey =
  (typeof opportunitySectionDefinitions)[number]["key"];

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
