import fs from "node:fs";

const path = "app/routes/deal-room.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  `  recordOpportunityAudit,\n  type OpportunityAccessState,`,
  `  recordOpportunityAudit,\n  recordOpportunityView,\n  type OpportunityAccessState,`,
  "recordOpportunityView import",
);
replaceOnce(
  `import { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";\nimport { requireActionRateLimit } from "~/lib/rate-limit.server";`,
  `import { hasAdminScope } from "~/lib/membership.server";\nimport { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";\nimport { requireActionRateLimit } from "~/lib/rate-limit.server";`,
  "hasAdminScope import",
);
replaceOnce(
  `  const admin = user\n    ? Boolean(\n        await db\n          .prepare("SELECT 1 FROM admin_users WHERE user_id = ?")\n          .bind(user.id)\n          .first(),\n      )\n    : false;`,
  `  const admin = user ? await hasAdminScope(db, user.id, "projects") : false;`,
  "scoped loader admin",
);
replaceOnce(
  `    await db\n      .prepare(\n        \`INSERT INTO opportunity_user_states\n           (project_id, user_id, last_viewed_at, updated_at)\n         VALUES (?, ?, datetime('now'), datetime('now'))\n         ON CONFLICT(project_id, user_id) DO UPDATE SET\n           last_viewed_at = datetime('now'), updated_at = datetime('now')\`,\n      )\n      .bind(preview.projectId, user.id)\n      .run();`,
  `    await recordOpportunityView(db, user.id, preview.projectId);`,
  "deduplicated view audit",
);
replaceOnce(
  `  const isAdmin = Boolean(\n    await db\n      .prepare("SELECT 1 FROM admin_users WHERE user_id = ?")\n      .bind(user.id)\n      .first(),\n  );`,
  `  const isAdmin =\n    (await hasAdminScope(db, user.id, "projects")) ||\n    (await hasAdminScope(db, user.id, "moderation"));`,
  "scoped action admin",
);
replaceOnce(
  `    await db\n      .prepare(\n        \`INSERT INTO introduction_requests\n           (id, project_id, investor_user_id, message, status, updated_at)\n         VALUES (?, ?, ?, ?, 'pending', datetime('now'))\`,\n      )\n      .bind(crypto.randomUUID(), listing.projectId, user.id, message)\n      .run();`,
  `    await db.batch([\n      db\n        .prepare(\n          \`INSERT INTO introduction_requests\n             (id, project_id, investor_user_id, message, status, updated_at)\n           VALUES (?, ?, ?, ?, 'pending', datetime('now'))\`,\n        )\n        .bind(crypto.randomUUID(), listing.projectId, user.id, message),\n      db\n        .prepare(\n          \`INSERT INTO notifications\n             (id, user_id, kind, title, body, action_url)\n           VALUES (?, ?, 'opportunity.introduction_requested',\n                   'Founder introduction requested', ?, ?)\`,\n        )\n        .bind(\n          crypto.randomUUID(),\n          listing.founderUserId,\n          \`\${user.displayName} requested an introduction for \${listing.title}.\`,\n          \`/deals/\${params.dealSlug}\`,\n        ),\n    ]);`,
  "introduction notification",
);
replaceOnce(
  `    await db\n      .prepare(\n        \`INSERT INTO opportunity_questions\n         (id, project_id, asked_by, question, status)\n         VALUES (?, ?, ?, ?, 'submitted')\`,\n      )\n      .bind(crypto.randomUUID(), listing.projectId, user.id, question)\n      .run();`,
  `    await db.batch([\n      db\n        .prepare(\n          \`INSERT INTO opportunity_questions\n           (id, project_id, asked_by, question, status)\n           VALUES (?, ?, ?, ?, 'submitted')\`,\n        )\n        .bind(crypto.randomUUID(), listing.projectId, user.id, question),\n      db\n        .prepare(\n          \`INSERT INTO notifications\n             (id, user_id, kind, title, body, action_url)\n           VALUES (?, ?, 'opportunity.question_submitted',\n                   'New Investor question', ?, ?)\`,\n        )\n        .bind(\n          crypto.randomUUID(),\n          listing.founderUserId,\n          \`\${user.displayName} submitted a question about \${listing.title}.\`,\n          \`/deals/\${params.dealSlug}\`,\n        ),\n    ]);`,
  "question notification",
);
replaceOnce(
  `    const updated = await db\n      .prepare(\n        \`UPDATE opportunity_questions\n         SET answer = ?, status = 'answered', answered_by = ?,\n             answered_at = datetime('now'), updated_at = datetime('now')\n         WHERE id = ? AND project_id = ? AND status = 'submitted'\`,\n      )\n      .bind(answer, user.id, questionId, listing.projectId)\n      .run();\n    if (!updated.meta.changes)\n      throw new Response("Question not found.", { status: 404 });`,
  `    const questionOwner = await db\n      .prepare(\n        \`SELECT asked_by AS askedBy\n         FROM opportunity_questions\n         WHERE id = ? AND project_id = ? AND status = 'submitted'\`,\n      )\n      .bind(questionId, listing.projectId)\n      .first<{ askedBy: string }>();\n    if (!questionOwner)\n      throw new Response("Question not found.", { status: 404 });\n    const updated = await db\n      .prepare(\n        \`UPDATE opportunity_questions\n         SET answer = ?, status = 'answered', answered_by = ?,\n             answered_at = datetime('now'), updated_at = datetime('now')\n         WHERE id = ? AND project_id = ? AND status = 'submitted'\`,\n      )\n      .bind(answer, user.id, questionId, listing.projectId)\n      .run();\n    if (!updated.meta.changes)\n      throw new Response("Question not found.", { status: 404 });\n    await db\n      .prepare(\n        \`INSERT INTO notifications\n           (id, user_id, kind, title, body, action_url)\n         VALUES (?, ?, 'opportunity.question_answered',\n                 'Your Investor question was answered', ?, ?)\`,\n      )\n      .bind(\n        crypto.randomUUID(),\n        questionOwner.askedBy,\n        \`A response is available for your question about \${listing.title}.\`,\n        \`/deals/\${params.dealSlug}\`,\n      )\n      .run();`,
  "answer notification",
);

fs.writeFileSync(path, source);
