import { requireUser } from "~/lib/auth.server";

export async function canOperateCampaign(
  db: D1Database,
  userId: string,
  campaignId: string,
) {
  return Boolean(
    await db
      .prepare(
        `SELECT 1
         FROM admin_users au
         LEFT JOIN admin_scopes campaign_scope
           ON campaign_scope.admin_user_id = au.user_id
              AND campaign_scope.scope = 'campaigns'
         LEFT JOIN admin_scopes moderation_scope
           ON moderation_scope.admin_user_id = au.user_id
              AND moderation_scope.scope = 'moderation'
         LEFT JOIN campaign_moderators cm
           ON cm.user_id = au.user_id AND cm.campaign_id = ?
         WHERE au.user_id = ?
           AND (au.access_level = 'superadmin'
                OR campaign_scope.scope IS NOT NULL
                OR moderation_scope.scope IS NOT NULL
                OR cm.user_id IS NOT NULL)`,
      )
      .bind(campaignId, userId)
      .first(),
  );
}

export async function requireCampaignOperator(
  request: Request,
  db: D1Database,
  campaignId: string,
) {
  const user = await requireUser(request, db);
  if (!(await canOperateCampaign(db, user.id, campaignId)))
    throw new Response("Campaign moderation required.", { status: 403 });
  return user;
}

export function parseJsonObject<T extends Record<string, unknown>>(
  value: string | null | undefined,
  fallback: T,
): T {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}
