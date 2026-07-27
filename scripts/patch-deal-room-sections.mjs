import fs from "node:fs";

const path = "app/routes/deal-room.tsx";
let source = fs.readFileSync(path, "utf8");
function replace(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing ${label}`);
  source = source.replace(search, replacement);
}

replace(
  `import { hasAdminScope } from "~/lib/membership.server";\nimport { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";`,
  `import { hasAdminScope } from "~/lib/membership.server";\nimport { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";\nimport { loadOpportunitySections } from "~/lib/opportunity-sections.server";\nimport { getVisibleProfile } from "~/lib/profile.server";`,
  "section and profile imports",
);
replace(
  `  founderUsername: string;`,
  `  founderUsername: string | null;`,
  "nullable founder username",
);
replace(
  `    const project = await db\n      .prepare(\n        \`SELECT slug FROM projects\n         WHERE slug = ? AND status = 'published'\n         LIMIT 1\`,\n      )\n      .bind(params.dealSlug)\n      .first<{ slug: string }>();\n    if (project) throw redirect(\`/projects/\${project.slug}\`);\n    throw new Response("Opportunity not found.", { status: 404 });`,
  `    throw new Response("The secure Deal Room is temporarily unavailable.", {\n      status: 503,\n    });`,
  "remove project fallback",
);
replace(
  `  if (!preview) throw new Response("Opportunity not found.", { status: 404 });\n\n  const admin = user ? await hasAdminScope(db, user.id, "projects") : false;`,
  `  if (!preview) throw new Response("Opportunity not found.", { status: 404 });\n\n  let visibleFounder: { displayName: string; username: string } | null = null;\n  try {\n    const profile = await getVisibleProfile(\n      db,\n      preview.founderUsername,\n      user?.id ?? null,\n    );\n    if (profile)\n      visibleFounder = {\n        displayName: profile.displayName,\n        username: profile.username,\n      };\n  } catch (error) {\n    if (!(error instanceof Response) || error.status !== 403) throw error;\n  }\n  const safePreview: PreviewRow = {\n    ...preview,\n    founderName: visibleFounder?.displayName ?? "AKARI Founder",\n    founderUsername: visibleFounder?.username ?? null,\n  };\n\n  const admin = user ? await hasAdminScope(db, user.id, "projects") : false;`,
  "privacy-safe founder preview",
);
replace(
  `  const publicUpdates = await db`,
  `  const sections = await loadOpportunitySections(db, preview.projectId, {\n    includeConfidential: fullAccess,\n  });\n\n  const publicUpdates = await db`,
  "load structured sections",
);
replace(
  `    preview,\n    admin,`,
  `    preview: safePreview,\n    sections,\n    admin,`,
  "return safe preview and sections",
);
replace(
  `            <p>\n              Shared by{" "}\n              <Link to={\`/profiles/\${preview.founderUsername}\`}>\n                {preview.founderName}\n              </Link>\n            </p>`,
  `            <p>\n              Shared by{" "}\n              {preview.founderUsername ? (\n                <Link to={\`/profiles/\${preview.founderUsername}\`}>\n                  {preview.founderName}\n                </Link>\n              ) : (\n                preview.founderName\n              )}\n            </p>`,
  "privacy-safe founder link",
);
replace(
  `            {loaderData.founder && (\n              <Link\n                className="button button-quiet"\n                to={\`/projects/\${preview.slug}/diligence\`}\n              >\n                Manage room access\n              </Link>\n            )}`,
  `            {loaderData.founder && (\n              <div className="deal-action-row">\n                <Link\n                  className="button button-primary"\n                  to={\`/projects/\${preview.slug}/opportunity/manage\`}\n                >\n                  Deal Room operations\n                </Link>\n                <Link\n                  className="button button-quiet"\n                  to={\`/projects/\${preview.slug}/diligence\`}\n                >\n                  Manage private documents\n                </Link>\n              </div>\n            )}`,
  "founder operation links",
);
replace(
  `        {loaderData.publicUpdates.length > 0 && (`,
  `        {loaderData.sections.length > 0 && (\n          <section className="deal-room-sections" aria-labelledby="deal-sections-title">\n            <header>\n              <span className="chapter">Reviewed Deal Room</span>\n              <h2 id="deal-sections-title">Opportunity information</h2>\n              <p>\n                Public sections are visible in the approved preview. Confidential\n                sections are returned only after the current server-side access check.\n              </p>\n            </header>\n            <div className="deal-section-grid">\n              {loaderData.sections.map((section) => (\n                <article key={section.id}>\n                  <span className="status-pill">\n                    {section.visibility === "confidential"\n                      ? "Authorised room"\n                      : "Approved preview"}\n                  </span>\n                  <h3>{section.title}</h3>\n                  <p>{section.body}</p>\n                </article>\n              ))}\n            </div>\n          </section>\n        )}\n\n        {loaderData.publicUpdates.length > 0 && (`,
  "render structured sections",
);

fs.writeFileSync(path, source);
