import fs from "node:fs";

const path = "app/routes/project-diligence.tsx";
let source = fs.readFileSync(path, "utf8");
function replace(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  source = source.replace(search, replacement);
}

replace(
  `import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";\nimport { assertSameOrigin } from "~/lib/security.server";`,
  `import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";\nimport {\n  isVerifiedInvestor,\n  isVerifiedInvestorId,\n  opportunityAccessStateForUserId,\n  recordOpportunityAudit,\n} from "~/lib/opportunity-access.server";\nimport { assertSameOrigin } from "~/lib/security.server";`,
  "opportunity security imports",
);

replace(
  `  const isFounder = project.founderUserId === user.id;\n  const isInvestor = user.roles.includes("investor");\n  if (!isFounder && !isInvestor)\n    throw new Response("Founder or Investor access required.", { status: 403 });`,
  `  const isFounder = project.founderUserId === user.id;\n  const isInvestor = user.roles.includes("investor");\n  if (!isFounder && !isInvestor)\n    throw new Response("Founder or Investor access required.", { status: 403 });\n  const opportunity = await db\n    .prepare("SELECT status FROM opportunity_listings WHERE project_id = ?")\n    .bind(project.id)\n    .first<{ status: string }>();\n  if (!isFounder && opportunity && !(await isVerifiedInvestor(db, user)))\n    throw new Response("Diligence room not found.", { status: 404 });`,
  "loader verification gate",
);

replace(
  `  if (intent === "request-data-room") {\n    if (!user.roles.includes("investor") || user.id === project.founderUserId)\n      throw new Response("Investor access required.", { status: 403 });`,
  `  if (intent === "request-data-room") {\n    if (\n      !user.roles.includes("investor") ||\n      user.id === project.founderUserId ||\n      !(await isVerifiedInvestor(db, user))\n    )\n      throw new Response("Verified Investor access required.", { status: 403 });`,
  "request verification gate",
);

replace(
  `    const valid = await db\n      .prepare(\n        \`SELECT 1 FROM project_documents pd\n       JOIN role_verifications rv ON rv.user_id = ? AND rv.role = 'investor' AND rv.status = 'verified'\n       WHERE pd.id = ? AND pd.project_id = ?\`,\n      )\n      .bind(investorUserId, documentId, project.id)\n      .first();\n    if (!valid) throw new Response("Invalid diligence grant.", { status: 400 });`,
  `    const valid = await db\n      .prepare(\n        \`SELECT pd.approved_at AS approvedAt,\n                ol.project_id AS opportunityProjectId\n         FROM project_documents pd\n         LEFT JOIN opportunity_listings ol ON ol.project_id = pd.project_id\n         WHERE pd.id = ? AND pd.project_id = ?\`,\n      )\n      .bind(documentId, project.id)\n      .first<{ approvedAt: string | null; opportunityProjectId: string | null }>();\n    if (!valid || !(await isVerifiedInvestorId(db, investorUserId)))\n      throw new Response("Invalid diligence grant.", { status: 400 });\n    if (valid.opportunityProjectId) {\n      if (!valid.approvedAt)\n        return { error: "AKARI must approve this document before it can be granted." };\n      if (\n        (await opportunityAccessStateForUserId(\n          db,\n          project.id,\n          investorUserId,\n        )) !== "approved"\n      )\n        return {\n          error:\n            "Approve this Investor's Deal Room request before granting documents.",\n        };\n    }`,
  "grant validation",
);

replace(
  `    const approved = intent === "approve-data-room";\n    await db.batch([`,
  `    const approved = intent === "approve-data-room";\n    if (approved && !(await isVerifiedInvestorId(db, target.investorUserId)))\n      return { error: "Only a currently verified Investor can receive access." };\n    await db.batch([`,
  "approval verification",
);

replace(
  `    throw redirect(\`/projects/\${project.slug}/diligence?decision=1\`);\n  }\n\n  throw new Response("Unsupported diligence action.", { status: 400 });`,
  `    await recordOpportunityAudit(\n      db,\n      user.id,\n      approved ? "opportunity.access_approved" : "opportunity.access_declined",\n      project.id,\n      { requestId, days, decisionNote: note },\n    );\n    throw redirect(\`/projects/\${project.slug}/diligence?decision=1\`);\n  }\n\n  if (intent === "revoke-data-room") {\n    const requestId = formText(form.get("requestId"));\n    const note = formText(form.get("decisionNote")).trim();\n    if (note.length < 5 || note.length > 500)\n      return { error: "Add a revocation note between 5 and 500 characters." };\n    const target = await db\n      .prepare(\n        \`SELECT investor_user_id AS investorUserId\n         FROM data_room_requests\n         WHERE id = ? AND project_id = ? AND status = 'approved'\`,\n      )\n      .bind(requestId, project.id)\n      .first<{ investorUserId: string }>();\n    if (!target) throw new Response("Approved request not found.", { status: 404 });\n    await db.batch([\n      db\n        .prepare(\n          \`UPDATE data_room_requests\n           SET status = 'revoked', reviewed_by = ?, reviewed_at = datetime('now'),\n               decision_note = ?, updated_at = datetime('now')\n           WHERE id = ? AND project_id = ?\`,\n        )\n        .bind(user.id, note, requestId, project.id),\n      db\n        .prepare(\n          \`UPDATE document_access_grants\n           SET revoked_at = datetime('now'), revoked_by = ?,\n               updated_at = datetime('now')\n           WHERE project_id = ? AND investor_user_id = ?\n             AND revoked_at IS NULL\`,\n        )\n        .bind(user.id, project.id, target.investorUserId),\n      db\n        .prepare(\n          \`INSERT INTO notifications\n             (id, user_id, kind, title, body, action_url)\n           VALUES (?, ?, 'opportunity.access_revoked',\n                   'Deal Room access revoked', ?, ?)\`,\n        )\n        .bind(\n          crypto.randomUUID(),\n          target.investorUserId,\n          \`Access to \${project.title} was revoked. \${note}\`,\n          \`/deals/\${project.slug}\`,\n        ),\n    ]);\n    await recordOpportunityAudit(\n      db,\n      user.id,\n      "opportunity.access_revoked",\n      project.id,\n      { requestId, investorUserId: target.investorUserId, decisionNote: note },\n    );\n    throw redirect(\`/projects/\${project.slug}/diligence?revoked=1\`);\n  }\n\n  throw new Response("Unsupported diligence action.", { status: 400 });`,
  "revocation action",
);

replace(
  `                    {!grant.revokedAt && (\n                      <Form method="post">`,
  `                    {!grant.revokedAt && (\n                      <Form method="post">`,
  "stable grant form marker",
);

replace(
  `              {loaderData.requests.map((item) => (\n                <article className="application-card" key={item.id}>`,
  `              {loaderData.requests.map((item) => (\n                <article className="application-card" key={item.id}>`,
  "stable request marker",
);

replace(
  `                    {item.status === "pending" && (\n                      <Form method="post" className="application-actions">`,
  `                    {item.status === "pending" && (\n                      <Form method="post" className="application-actions">`,
  "stable pending request form",
);

replace(
  `                    )}\n                  </article>\n                ))}`,
  `                    )}\n                    {item.status === "approved" && (\n                      <Form method="post" className="application-actions">\n                        <input type="hidden" name="requestId" value={item.id} />\n                        <label>\n                          Revocation note\n                          <textarea\n                            name="decisionNote"\n                            minLength={5}\n                            maxLength={500}\n                            required\n                          />\n                        </label>\n                        <button\n                          className="button button-quiet"\n                          name="intent"\n                          value="revoke-data-room"\n                          disabled={pending}\n                        >\n                          Revoke Deal Room access\n                        </button>\n                      </Form>\n                    )}\n                  </article>\n                ))}`,
  "approved request revoke UI",
);

fs.writeFileSync(path, source);
