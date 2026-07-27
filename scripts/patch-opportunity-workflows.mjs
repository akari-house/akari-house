import fs from "node:fs";

function patch(path, changes) {
  let source = fs.readFileSync(path, "utf8");
  for (const [label, search, replacement] of changes) {
    if (!source.includes(search)) throw new Error(`${path}: missing ${label}`);
    source = source.replace(search, replacement);
  }
  fs.writeFileSync(path, source);
}

patch("app/routes/admin-opportunities.tsx", [
  [
    "section service import",
    `import { recordOpportunityAudit } from "~/lib/opportunity-access.server";\nimport { assertSameOrigin } from "~/lib/security.server";`,
    `import { recordOpportunityAudit } from "~/lib/opportunity-access.server";\nimport { publishSubmittedOpportunitySections } from "~/lib/opportunity-sections.server";\nimport { assertSameOrigin } from "~/lib/security.server";`,
  ],
  [
    "publish sections",
    `    await recordOpportunityAudit(\n      db,\n      admin.id,\n      \`opportunity.\${nextStatus}\`,\n      projectId,\n      { decisionNote },\n    );`,
    `    if (nextStatus === "published")\n      await publishSubmittedOpportunitySections(\n        db,\n        projectId,\n        admin.id,\n        decisionNote,\n      );\n    await recordOpportunityAudit(\n      db,\n      admin.id,\n      \`opportunity.\${nextStatus}\`,\n      projectId,\n      { decisionNote },\n    );`,
  ],
  [
    "operations link",
    `          <Link className="button button-quiet" to="/admin/operations">\n            Operations centre\n          </Link>`,
    `          <div className="deal-action-row">\n            <Link\n              className="button button-primary"\n              to="/admin/opportunities/operations"\n            >\n              Deal Room operations\n            </Link>\n            <Link className="button button-quiet" to="/admin/operations">\n              Operations centre\n            </Link>\n          </div>`,
  ],
]);

patch("app/routes/project-opportunity.tsx", [
  [
    "manage link",
    `          <Link\n            className="button button-quiet"\n            to={\`/projects/\${loaderData.project.slug}\`}\n          >\n            Return to project\n          </Link>`,
    `          <div className="deal-action-row">\n            {listing && (\n              <Link\n                className="button button-primary"\n                to={\`/projects/\${loaderData.project.slug}/opportunity/manage\`}\n              >\n                Deal Room operations\n              </Link>\n            )}\n            <Link\n              className="button button-quiet"\n              to={\`/projects/\${loaderData.project.slug}\`}\n            >\n              Return to project\n            </Link>\n          </div>`,
  ],
]);
