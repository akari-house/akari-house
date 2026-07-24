import type { Route } from "./+types/project-document";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { ensureDiligenceSchema } from "~/lib/diligence-schema.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await ensureDiligenceSchema(env.DB);
  const user = await requireApprovedMember(request, env.DB);
  const document = await env.DB.prepare(
    `SELECT pd.id, pd.project_id AS projectId, pd.object_key AS objectKey,
            pd.content_type AS contentType, pd.title,
            pr.founder_user_id AS founderUserId,
            dag.id AS grantId, COALESCE(dag.can_download, 0) AS canDownload
     FROM project_documents pd
     JOIN projects pr ON pr.id = pd.project_id
     LEFT JOIN document_access_grants dag
       ON dag.project_id = pr.id AND dag.document_id = pd.id
      AND dag.investor_user_id = ? AND dag.revoked_at IS NULL
      AND dag.starts_at <= datetime('now') AND dag.expires_at > datetime('now')
     WHERE pd.id = ? AND pr.slug = ?`,
  )
    .bind(user.id, params.documentId, params.slug)
    .first<{
      id: string;
      projectId: string;
      objectKey: string;
      contentType: string;
      title: string;
      founderUserId: string;
      grantId: string | null;
      canDownload: number;
    }>();

  if (!document) throw new Response("Document not found.", { status: 404 });
  const owner = document.founderUserId === user.id;
  const granted = Boolean(document.grantId);
  if (!owner && !granted) {
    await env.DB.prepare(
      `INSERT INTO document_access_logs
       (id, project_id, document_id, user_id, action, metadata_json)
       VALUES (?, ?, ?, ?, 'denied', ?)`,
    )
      .bind(
        crypto.randomUUID(),
        document.projectId,
        document.id,
        user.id,
        JSON.stringify({ reason: "no_active_grant" }),
      )
      .run();
    throw new Response("Document not found.", { status: 404 });
  }

  const object = await env.MEDIA.get(document.objectKey);
  if (!object) throw new Response("Document not found.", { status: 404 });
  const action = owner || document.canDownload ? "download" : "view";
  await env.DB.prepare(
    `INSERT INTO document_access_logs
     (id, grant_id, project_id, document_id, user_id, action)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      document.grantId,
      document.projectId,
      document.id,
      user.id,
      action,
    )
    .run();
  const safeName = document.title.replace(/[^\w.-]+/g, "-").slice(0, 100);
  return new Response(object.body, {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `${action === "download" ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
