import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, before, after) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before))
    throw new Error(`Expected source not found in ${path}: ${before.slice(0, 100)}`);
  writeFileSync(path, source.replace(before, after));
}

function appendOnce(path, marker, content) {
  const source = readFileSync(path, "utf8");
  if (source.includes(marker)) return;
  writeFileSync(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

const detail = "app/routes/project-detail.tsx";
replaceExact(
  detail,
  'import { SiteHeader } from "~/components/SiteHeader";\n',
  'import { ProjectNeedChips } from "~/components/projects/ProjectNeedChips";\nimport { SiteHeader } from "~/components/SiteHeader";\n',
);
replaceExact(
  detail,
  'import { cloudflareContext } from "~/lib/cloudflare-context";\n',
  'import { cloudflareContext } from "~/lib/cloudflare-context";\nimport { projectHasOpenNeed } from "~/lib/project-need-status";\nimport { projectHasNeed } from "~/lib/project-needs";\n',
);
replaceExact(
  detail,
  '  seeking: string;\n  status: string;\n',
  '  seeking: string;\n  supportStatus: string;\n  status: string;\n',
);
replaceExact(
  detail,
  '              pr.summary, pr.description, pr.stage, pr.seeking, pr.status,\n',
  '              pr.summary, pr.description, pr.stage, pr.seeking,\n              pr.support_status_json AS supportStatus, pr.status,\n',
);
replaceExact(
  detail,
  '      `SELECT id, founder_user_id AS founderUserId, title, status\n       FROM projects WHERE slug = ?`,\n',
  '      `SELECT id, founder_user_id AS founderUserId, title, status, seeking,\n              support_status_json AS supportStatus\n       FROM projects WHERE slug = ?`,\n',
);
replaceExact(
  detail,
  '      title: string;\n      status: string;\n    }>();\n',
  '      title: string;\n      status: string;\n      seeking: string;\n      supportStatus: string;\n    }>();\n',
);
replaceExact(
  detail,
  '  const form = await request.formData();\n  const intent = formText(form.get("intent"));\n',
  '  const fundraisingClosed =\n    projectHasNeed(project.seeking, "fundraising") &&\n    !projectHasOpenNeed(\n      project.seeking,\n      project.supportStatus,\n      "fundraising",\n    );\n  const form = await request.formData();\n  const intent = formText(form.get("intent"));\n',
);
replaceExact(
  detail,
  '  if (intent === "interest") {\n    if (!(await isVerifiedInvestor(db, user)))\n',
  '  if (intent === "interest") {\n    if (fundraisingClosed)\n      return {\n        error:\n          "This Founder has marked fundraising as paused, completed or no longer open.",\n      };\n    if (!(await isVerifiedInvestor(db, user)))\n',
);
replaceExact(
  detail,
  '  const navigation = useNavigation();\n  const isFounder = user?.id === project.founderUserId;\n',
  '  const navigation = useNavigation();\n  const isFounder = user?.id === project.founderUserId;\n  const fundraisingClosed =\n    projectHasNeed(project.seeking, "fundraising") &&\n    !projectHasOpenNeed(\n      project.seeking,\n      project.supportStatus,\n      "fundraising",\n    );\n',
);
replaceExact(
  detail,
  `        {project.seeking && (\n          <aside className="project-seeking-panel">\n            <strong>Looking for</strong>\n            <p>{project.seeking}</p>\n          </aside>\n        )}\n`,
  `        {project.seeking && (\n          <aside className="project-seeking-panel">\n            <strong>Support status</strong>\n            <div className="project-support-groups">\n              <div>\n                <span className="eyebrow">Open</span>\n                <ProjectNeedChips\n                  value={project.seeking}\n                  statusValue={project.supportStatus}\n                  mode="open"\n                />\n              </div>\n              <div>\n                <span className="eyebrow">Progress</span>\n                <ProjectNeedChips\n                  value={project.seeking}\n                  statusValue={project.supportStatus}\n                  mode="closed"\n                />\n              </div>\n            </div>\n          </aside>\n        )}\n`,
);
replaceExact(
  detail,
  `        {user?.roles.includes("investor") && !isFounder && (\n          <section className="project-action-panel">\n            <h2>Express investment interest</h2>\n            {!loaderData.verifiedInvestor && (\n              <p className="notice">\n                Admin verification is required before an Investor can send an\n                interest request.\n              </p>\n            )}\n            {actionData?.error && (\n              <p className="form-error" role="alert">\n                {actionData.error}\n              </p>\n            )}\n            <Form method="post" className="form-stack">\n              <label>\n                Why would a conversation be useful?\n                <textarea\n                  name="message"\n                  minLength={10}\n                  maxLength={800}\n                  rows={4}\n                  required\n                />\n              </label>\n              <label className="inline-choice">\n                <input type="checkbox" name="shareContact" value="yes" />\n                Allow the founder to see contact methods I marked for project\n                interests\n              </label>\n              <button\n                className="button button-primary"\n                name="intent"\n                value="interest"\n                disabled={\n                  navigation.state !== "idle" || !loaderData.verifiedInvestor\n                }\n              >\n                {loaderData.ownInterest\n                  ? "Update my interest"\n                  : "Show interest"}\n              </button>\n              {loaderData.ownInterest?.status !== "withdrawn" && (\n                <button\n                  className="text-button"\n                  name="intent"\n                  value="withdraw-interest"\n                >\n                  Withdraw interest\n                </button>\n              )}\n            </Form>\n          </section>\n        )}\n`,
  `        {user?.roles.includes("investor") && !isFounder && (\n          <section className="project-action-panel">\n            <h2>Express investment interest</h2>\n            {fundraisingClosed ? (\n              <p className="notice">\n                Fundraising is not currently open. The Founder-reported outcome\n                remains visible above for context.\n              </p>\n            ) : (\n              <>\n                {!loaderData.verifiedInvestor && (\n                  <p className="notice">\n                    Admin verification is required before an Investor can send\n                    an interest request.\n                  </p>\n                )}\n                {actionData?.error && (\n                  <p className="form-error" role="alert">\n                    {actionData.error}\n                  </p>\n                )}\n                <Form method="post" className="form-stack">\n                  <label>\n                    Why would a conversation be useful?\n                    <textarea\n                      name="message"\n                      minLength={10}\n                      maxLength={800}\n                      rows={4}\n                      required\n                    />\n                  </label>\n                  <label className="inline-choice">\n                    <input type="checkbox" name="shareContact" value="yes" />\n                    Allow the founder to see contact methods I marked for project\n                    interests\n                  </label>\n                  <button\n                    className="button button-primary"\n                    name="intent"\n                    value="interest"\n                    disabled={\n                      navigation.state !== "idle" || !loaderData.verifiedInvestor\n                    }\n                  >\n                    {loaderData.ownInterest\n                      ? "Update my interest"\n                      : "Show interest"}\n                  </button>\n                  {loaderData.ownInterest?.status !== "withdrawn" && (\n                    <button\n                      className="text-button"\n                      name="intent"\n                      value="withdraw-interest"\n                    >\n                      Withdraw interest\n                    </button>\n                  )}\n                </Form>\n              </>\n            )}\n          </section>\n        )}\n`,
);

const deals = "app/routes/deals.tsx";
replaceExact(
  deals,
  'import { cloudflareContext } from "~/lib/cloudflare-context";\n',
  'import { cloudflareContext } from "~/lib/cloudflare-context";\nimport {\n  projectHasOpenNeed,\n  projectNeedPublicLabel,\n  projectNeedStatus,\n} from "~/lib/project-need-status";\nimport { projectHasNeed } from "~/lib/project-needs";\n',
);
replaceExact(
  deals,
  '  listingStatus: string;\n};\n',
  '  listingStatus: string;\n  seeking: string;\n  supportStatus: string;\n};\n',
);
replaceExact(
  deals,
  '      `SELECT pr.id AS projectId, pr.slug, pr.title, pr.summary,\n              ol.public_summary AS publicSummary, pr.stage, ol.sector,\n',
  '      `SELECT pr.id AS projectId, pr.slug, pr.title, pr.summary,\n              pr.seeking, pr.support_status_json AS supportStatus,\n              ol.public_summary AS publicSummary, pr.stage, ol.sector,\n',
);
replaceExact(
  deals,
  '              const range = [\n                money(opportunity.raiseMinimum, opportunity.raiseCurrency),\n                money(opportunity.raiseMaximum, opportunity.raiseCurrency),\n              ].filter(Boolean);\n',
  '              const range = [\n                money(opportunity.raiseMinimum, opportunity.raiseCurrency),\n                money(opportunity.raiseMaximum, opportunity.raiseCurrency),\n              ].filter(Boolean);\n              const fundraisingClosed =\n                projectHasNeed(opportunity.seeking, "fundraising") &&\n                !projectHasOpenNeed(\n                  opportunity.seeking,\n                  opportunity.supportStatus,\n                  "fundraising",\n                );\n              const fundraisingRecord = projectNeedStatus(\n                opportunity.supportStatus,\n                "fundraising",\n              );\n',
);
replaceExact(
  deals,
  `                  <div className="deal-card-topline">\n                    <span>{opportunity.sector || "Selected opportunity"}</span>\n                    <span>{opportunity.stage.replaceAll("_", " ")}</span>\n                  </div>\n`,
  `                  <div className="deal-card-topline">\n                    <span>{opportunity.sector || "Selected opportunity"}</span>\n                    <span>{opportunity.stage.replaceAll("_", " ")}</span>\n                  </div>\n                  {fundraisingClosed && (\n                    <span className="status-pill status-closed deal-round-status">\n                      {projectNeedPublicLabel(\n                        "fundraising",\n                        fundraisingRecord,\n                      )}\n                      <small>Founder-reported</small>\n                    </span>\n                  )}\n`,
);

const room = "app/routes/deal-room.tsx";
replaceExact(
  room,
  'import { hasAdminScope } from "~/lib/membership.server";\n',
  'import { hasAdminScope } from "~/lib/membership.server";\nimport {\n  projectHasOpenNeed,\n  projectNeedPublicLabel,\n  projectNeedStatus,\n} from "~/lib/project-need-status";\nimport { projectHasNeed } from "~/lib/project-needs";\n',
);
replaceExact(
  room,
  '  founderUsername: string;\n};\n',
  '  founderUsername: string;\n  seeking: string;\n  supportStatus: string;\n};\n',
);
replaceExact(
  room,
  '              pr.slug, pr.title, pr.summary,\n',
  '              pr.slug, pr.title, pr.summary, pr.seeking,\n              pr.support_status_json AS supportStatus,\n',
);
replaceExact(
  room,
  '      `SELECT pr.id AS projectId, pr.founder_user_id AS founderUserId,\n              pr.title, ol.access_mode AS accessMode\n',
  '      `SELECT pr.id AS projectId, pr.founder_user_id AS founderUserId,\n              pr.title, pr.seeking,\n              pr.support_status_json AS supportStatus,\n              ol.access_mode AS accessMode\n',
);
replaceExact(
  room,
  '      title: string;\n      accessMode: "verified_investors" | "approved_only";\n',
  '      title: string;\n      seeking: string;\n      supportStatus: string;\n      accessMode: "verified_investors" | "approved_only";\n',
);
replaceExact(
  room,
  '  const isAdmin =\n    (await hasAdminScope(db, user.id, "projects")) ||\n    (await hasAdminScope(db, user.id, "moderation"));\n',
  '  const isAdmin =\n    (await hasAdminScope(db, user.id, "projects")) ||\n    (await hasAdminScope(db, user.id, "moderation"));\n  const fundraisingClosed =\n    projectHasNeed(listing.seeking, "fundraising") &&\n    !projectHasOpenNeed(\n      listing.seeking,\n      listing.supportStatus,\n      "fundraising",\n    );\n',
);
replaceExact(
  room,
  '  if (intent === "request-access") {\n    if (!verifiedInvestor)\n',
  '  if (intent === "request-access") {\n    if (fundraisingClosed)\n      return { error: "This fundraising round is not currently open." };\n    if (!verifiedInvestor)\n',
);
replaceExact(
  room,
  '  if (intent === "interest" || intent === "withdraw-interest") {\n    if (!verifiedInvestor)\n',
  '  if (intent === "interest" || intent === "withdraw-interest") {\n    if (intent === "interest" && fundraisingClosed)\n      return { error: "This fundraising round is not currently open." };\n    if (!verifiedInvestor)\n',
);
replaceExact(
  room,
  '  if (intent === "request-introduction") {\n    if (!verifiedInvestor)\n',
  '  if (intent === "request-introduction") {\n    if (fundraisingClosed)\n      return { error: "New introductions are closed for this round." };\n    if (!verifiedInvestor)\n',
);
replaceExact(
  room,
  '  const accessRequestable =\n    loaderData.verifiedInvestor &&\n    loaderData.accessState === "request_required";\n',
  '  const fundraisingClosed =\n    projectHasNeed(preview.seeking, "fundraising") &&\n    !projectHasOpenNeed(\n      preview.seeking,\n      preview.supportStatus,\n      "fundraising",\n    );\n  const fundraisingRecord = projectNeedStatus(\n    preview.supportStatus,\n    "fundraising",\n  );\n  const accessRequestable =\n    !fundraisingClosed &&\n    loaderData.verifiedInvestor &&\n    loaderData.accessState === "request_required";\n',
);
replaceExact(
  room,
  `            <p>\n              Shared by{" "}\n              {preview.founderUsername ? (\n                <Link to={\`/profiles/\${preview.founderUsername}\`}>\n                  {preview.founderName}\n                </Link>\n              ) : (\n                preview.founderName\n              )}\n            </p>\n`,
  `            <p>\n              Shared by{" "}\n              {preview.founderUsername ? (\n                <Link to={\`/profiles/\${preview.founderUsername}\`}>\n                  {preview.founderName}\n                </Link>\n              ) : (\n                preview.founderName\n              )}\n            </p>\n            {fundraisingClosed && (\n              <div className="deal-round-closed" role="status">\n                <strong>\n                  {projectNeedPublicLabel("fundraising", fundraisingRecord)}\n                </strong>\n                <span>Founder-reported · New investment requests are closed.</span>\n              </div>\n            )}\n`,
);
replaceExact(
  room,
  `            <Form method="post" className="form-stack">\n              <label>\n                Non-binding interest note\n                <textarea\n                  name="message"\n                  minLength={10}\n                  maxLength={800}\n                  required\n                />\n              </label>\n              <button\n                className="button button-primary"\n                name="intent"\n                value="interest"\n              >\n                {loaderData.ownInterest?.status === "active"\n                  ? "Update non-binding interest"\n                  : "Register non-binding interest"}\n              </button>\n              {loaderData.ownInterest?.status === "active" && (\n                <button\n                  className="text-button"\n                  name="intent"\n                  value="withdraw-interest"\n                >\n                  Withdraw interest\n                </button>\n              )}\n            </Form>\n`,
  `            {fundraisingClosed ? (\n              <p className="notice">\n                This round is not accepting new non-binding interest. Existing\n                saved records and authorised access remain available.\n              </p>\n            ) : (\n              <Form method="post" className="form-stack">\n                <label>\n                  Non-binding interest note\n                  <textarea\n                    name="message"\n                    minLength={10}\n                    maxLength={800}\n                    required\n                  />\n                </label>\n                <button\n                  className="button button-primary"\n                  name="intent"\n                  value="interest"\n                >\n                  {loaderData.ownInterest?.status === "active"\n                    ? "Update non-binding interest"\n                    : "Register non-binding interest"}\n                </button>\n              </Form>\n            )}\n            {loaderData.ownInterest?.status === "active" && (\n              <Form method="post">\n                <button\n                  className="text-button"\n                  name="intent"\n                  value="withdraw-interest"\n                >\n                  Withdraw interest\n                </button>\n              </Form>\n            )}\n`,
);
replaceExact(
  room,
  `                <Form method="post" className="form-stack">\n                  <label>\n                    Founder introduction note\n`,
  `                <Form method="post" className="form-stack">\n                  <label>\n                    Founder introduction note\n`,
);
replaceExact(
  room,
  '                      disabled={["pending", "approved"].includes(\n                        loaderData.introduction?.status ?? "",\n                      )}\n',
  '                      disabled={\n                        fundraisingClosed ||\n                        ["pending", "approved"].includes(\n                          loaderData.introduction?.status ?? "",\n                        )\n                      }\n',
);
replaceExact(
  room,
  '                    disabled={["pending", "approved"].includes(\n                      loaderData.introduction?.status ?? "",\n                    )}\n',
  '                    disabled={\n                      fundraisingClosed ||\n                      ["pending", "approved"].includes(\n                        loaderData.introduction?.status ?? "",\n                      )\n                    }\n',
);
replaceExact(
  room,
  '                    {loaderData.introduction?.status === "pending"\n                      ? "Introduction requested"\n',
  '                    {fundraisingClosed\n                      ? "Introductions closed for this round"\n                      : loaderData.introduction?.status === "pending"\n                        ? "Introduction requested"\n',
);

appendOnce(
  "app/styles/app.css",
  ".project-need-status-section",
  `
.project-need-status-section {
  margin-top: 2rem;
}

.project-need-status-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  margin-top: 1rem;
}

.project-need-status-card {
  background: rgba(15, 18, 30, 0.82);
  border: 1px solid rgba(236, 72, 153, 0.24);
  border-radius: 18px;
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
}

.project-need-status-card > div {
  display: grid;
  gap: 0.35rem;
}

.project-need-status-card small,
.project-need-chips span small,
.deal-round-status small {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-top: 0.2rem;
  opacity: 0.72;
}

.project-need-chips span.is-completed,
.project-need-chips span.is-closed,
.project-need-chips span.is-paused,
.deal-round-status,
.deal-round-closed {
  border-color: rgba(255, 209, 102, 0.42);
  background: rgba(255, 209, 102, 0.08);
}

.project-lantern-seeking.is-progress {
  border-left-color: rgba(255, 209, 102, 0.72);
}

.project-support-groups {
  display: grid;
  gap: 1rem;
  margin-top: 0.8rem;
}

.project-support-groups > div {
  display: grid;
  gap: 0.55rem;
}

.deal-round-status {
  align-items: flex-start;
  display: inline-flex;
  flex-direction: column;
  margin-bottom: 0.9rem;
}

.deal-round-closed {
  border: 1px solid rgba(255, 209, 102, 0.42);
  border-radius: 14px;
  display: grid;
  gap: 0.25rem;
  margin-top: 1rem;
  padding: 0.8rem 1rem;
}
`,
);
