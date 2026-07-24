import type { Route } from "./+types/project-document";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const user = await requireApprovedMember(request, env.DB);
  const document = await env.DB.prepare(
    `SELECT pd.object_key AS objectKey, pd.content_type AS contentType,
            pd.title, pr.founder_user_id AS founderUserId
     FROM project_documents pd
     JOIN projects pr ON pr.id = pd.project_id
     WHERE pd.id = ? AND pr.slug = ?`,
  )
    .bind(params.documentId, params.slug)
    .first<{
      objectKey: string;
      contentType: string;
      title: string;
      founderUserId: string;
    }>();
  if (!document || document.founderUserId !== user.id)
    throw new Response("Document not found.", { status: 404 });
  const object = await env.MEDIA.get(document.objectKey);
  if (!object) throw new Response("Document not found.", { status: 404 });
  const safeName = document.title.replace(/[^\w.-]+/g, "-").slice(0, 100);
  return new Response(object.body, {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
