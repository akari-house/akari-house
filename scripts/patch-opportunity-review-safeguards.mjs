import fs from "node:fs";

const path = "app/routes/admin-opportunities.tsx";
let source = fs.readFileSync(path, "utf8");
function replace(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  source = source.replace(search, replacement);
}

replace(
  `  submittedAt: string | null;\n  decisionNote: string;\n};`,
  `  submittedAt: string | null;\n  decisionNote: string;\n  sectionsJson: string;\n};`,
  "listing sections type",
);

replace(
  `                     ol.status, ol.submitted_at AS submittedAt,\n                     ol.decision_note AS decisionNote`,
  `                     ol.status, ol.submitted_at AS submittedAt,\n                     ol.decision_note AS decisionNote,\n                     COALESCE((\n                       SELECT json_group_array(json_object(\n                         'id', os.id,\n                         'title', os.title,\n                         'body', os.body,\n                         'visibility', os.visibility,\n                         'status', os.status\n                       ))\n                       FROM opportunity_sections os\n                       WHERE os.project_id = pr.id\n                         AND os.status IN ('submitted', 'published')\n                         AND trim(os.body) <> ''\n                     ), '[]') AS sectionsJson`,
  "listing sections query",
);

replace(
  `type AdminPermissionRow = {\n  accessLevel: "admin" | "superadmin";\n  scopes: string | null;\n};`,
  `type AdminPermissionRow = {\n  accessLevel: "admin" | "superadmin";\n  scopes: string | null;\n};\n\ntype ReviewedSection = {\n  id: string;\n  title: string;\n  body: string;\n  visibility: "public" | "confidential";\n  status: string;\n};\n\nfunction reviewedSections(value: string) {\n  try {\n    const sections = JSON.parse(value) as ReviewedSection[];\n    return Array.isArray(sections) ? sections : [];\n  } catch {\n    return [];\n  }\n}`,
  "reviewed section parser",
);

replace(
  `                       <aside className="deal-risk-note">\n                         <strong>Submitted risk information</strong>\n                         <p>{listing.riskSummary}</p>\n                       </aside>\n                       <Link to={\`/projects/\${listing.slug}\`}>`,
  `                       <aside className="deal-risk-note">\n                         <strong>Submitted risk information</strong>\n                         <p>{listing.riskSummary}</p>\n                       </aside>\n                       {reviewedSections(listing.sectionsJson).length > 0 && (\n                         <div className="admin-review-sections">\n                           <h4>Submitted Deal Room sections</h4>\n                           {reviewedSections(listing.sectionsJson).map((section) => (\n                             <article key={section.id}>\n                               <span className="status-pill">\n                                 {section.visibility} · {section.status}\n                               </span>\n                               <strong>{section.title}</strong>\n                               <p>{section.body}</p>\n                             </article>\n                           ))}\n                         </div>\n                       )}\n                       <Link to={\`/projects/\${listing.slug}\`}>`,
  "section review UI",
);

replace(
  `    if (nextStatus === "verified")\n      statements.splice(\n        3,\n        0,\n        db\n          .prepare(\n            \`INSERT INTO verification_provenance\n             (id, user_id, role, evidence_category, verified_by,\n              review_due_at, note)\n             VALUES (?, ?, 'investor', ?, ?, datetime('now', ?), ?)\`,\n          )\n          .bind(\n            crypto.randomUUID(),\n            userId,\n            evidenceCategory,\n            admin.id,\n            \`+\${reviewMonths} months\`,\n            decisionNote,\n          ),\n      );\n    await db.batch(statements);`,
  `    if (nextStatus === "verified")\n      statements.splice(\n        3,\n        0,\n        db\n          .prepare(\n            \`INSERT INTO verification_provenance\n             (id, user_id, role, evidence_category, verified_by,\n              review_due_at, note)\n             VALUES (?, ?, 'investor', ?, ?, datetime('now', ?), ?)\`,\n          )\n          .bind(\n            crypto.randomUUID(),\n            userId,\n            evidenceCategory,\n            admin.id,\n            \`+\${reviewMonths} months\`,\n            decisionNote,\n          ),\n      );\n    else\n      statements.push(\n        db\n          .prepare(\n            \`UPDATE data_room_requests\n             SET status = 'revoked', reviewed_by = ?,\n                 reviewed_at = datetime('now'), decision_note = ?,\n                 updated_at = datetime('now')\n             WHERE investor_user_id = ?\n               AND status IN ('pending', 'approved')\`,\n          )\n          .bind(admin.id, decisionNote, userId),\n        db\n          .prepare(\n            \`UPDATE document_access_grants\n             SET revoked_at = datetime('now'), revoked_by = ?,\n                 updated_at = datetime('now')\n             WHERE investor_user_id = ? AND revoked_at IS NULL\`,\n          )\n          .bind(admin.id, userId),\n      );\n    await db.batch(statements);`,
  "restriction revokes room and documents",
);

fs.writeFileSync(path, source);
