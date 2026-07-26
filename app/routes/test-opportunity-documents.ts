import type { Route } from "./+types/test-opportunity-documents";
import { cloudflareContext } from "~/lib/cloudflare-context";

const fixtureHeader = "launch-gate-v1";
const projectSlug = "opportunity-gate-project";

function allowFixtureRequest(request: Request) {
  const url = new URL(request.url);
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
    request.headers.get("x-akari-test-fixture") === fixtureHeader
  );
}

export function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (!allowFixtureRequest(request))
    throw new Response("Not found", { status: 404 });
  const db = context.get(cloudflareContext).env.DB;
  const document = await db
    .prepare(
      `SELECT pd.id, pd.project_id AS projectId,
              pd.approved_at AS approvedAt
       FROM project_documents pd
       JOIN projects pr ON pr.id = pd.project_id
       WHERE pr.slug = ?
       ORDER BY pd.created_at DESC LIMIT 1`,
    )
    .bind(projectSlug)
    .first<{
      id: string;
      projectId: string;
      approvedAt: string | null;
    }>();
  if (!document)
    throw new Response("Create the opportunity document fixture first.", {
      status: 409,
    });

  if (params.action === "unapprove") {
    await db
      .prepare(
        `UPDATE project_documents
         SET approved_at = NULL, approved_by = NULL
         WHERE id = ? AND project_id = ?`,
      )
      .bind(document.id, document.projectId)
      .run();
    return Response.json(
      { documentId: document.id, approved: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (params.action === "state") {
    const state = await db
      .prepare(
        `SELECT pd.approved_at AS approvedAt,
                COUNT(CASE
                  WHEN dag.revoked_at IS NULL
                   AND dag.starts_at <= datetime('now')
                   AND dag.expires_at > datetime('now')
                  THEN 1 END) AS activeGrants
         FROM project_documents pd
         LEFT JOIN document_access_grants dag ON dag.document_id = pd.id
         WHERE pd.id = ?
         GROUP BY pd.id`,
      )
      .bind(document.id)
      .first<{ approvedAt: string | null; activeGrants: number }>();
    return Response.json(
      {
        documentId: document.id,
        approved: Boolean(state?.approvedAt),
        activeGrants: Number(state?.activeGrants ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  throw new Response("Unknown document fixture action.", { status: 400 });
}
