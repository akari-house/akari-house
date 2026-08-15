import type { Route } from "./+types/activation-next-actions";
import {
  recordActivationShown,
  syncActivationMilestones,
} from "~/lib/activation-analytics.server";
import { buildMemberNextActions } from "~/lib/activation-next-actions";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { profileCompletion } from "~/lib/profile-completion";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);

  const [profile, founderState, creatorState, investorState, inboxState] =
    await Promise.all([
      db
        .prepare(
          `SELECT display_name AS displayName, COALESCE(headline, '') AS headline,
                  COALESCE(bio, '') AS bio, COALESCE(location, '') AS location,
                  COALESCE(website_url, '') AS websiteUrl,
                  COALESCE(expertise, '') AS expertise,
                  COALESCE(open_to, '') AS openTo
           FROM profiles WHERE user_id = ?`,
        )
        .bind(user.id)
        .first<{
          displayName: string;
          headline: string;
          bio: string;
          location: string;
          websiteUrl: string;
          expertise: string;
          openTo: string;
        }>(),
      user.roles.includes("founder")
        ? db
            .prepare(
              `SELECT
                 COUNT(DISTINCT p.id) AS projectCount,
                 COUNT(DISTINCT CASE WHEN p.status = 'draft' THEN p.id END) AS draftProjectCount,
                 (SELECT COUNT(*) FROM project_relationships pr
                    WHERE pr.user_id = ? AND pr.claim_status = 'pending') AS pendingClaimCount
               FROM projects p
               LEFT JOIN project_collaborators pc
                 ON pc.project_id = p.id AND pc.user_id = ?
               WHERE p.founder_user_id = ? OR pc.user_id = ?`,
            )
            .bind(user.id, user.id, user.id, user.id)
            .first<{
              projectCount: number;
              draftProjectCount: number;
              pendingClaimCount: number;
            }>()
        : Promise.resolve(null),
      user.roles.includes("creator")
        ? db
            .prepare(
              `SELECT
                 COALESCE(x.profile_url, '') AS xProfileUrl,
                 x.follower_count AS xFollowerCount,
                 r.x_score AS xScore,
                 r.sorsa_score AS sorsaScore
               FROM profiles p
               LEFT JOIN profile_social_accounts x
                 ON x.user_id = p.user_id AND x.platform = 'x'
               LEFT JOIN profile_reputation_signals r ON r.user_id = p.user_id
               WHERE p.user_id = ?`,
            )
            .bind(user.id)
            .first<{
              xProfileUrl: string;
              xFollowerCount: number | null;
              xScore: number | null;
              sorsaScore: number | null;
            }>()
        : Promise.resolve(null),
      user.roles.includes("investor")
        ? db
            .prepare(
              `SELECT status,
                      sectors_json AS sectorsJson,
                      stages_json AS stagesJson,
                      geographies_json AS geographiesJson,
                      minimum_ticket AS minimumTicket,
                      maximum_ticket AS maximumTicket
               FROM investor_profiles WHERE user_id = ?`,
            )
            .bind(user.id)
            .first<{
              status: string;
              sectorsJson: string;
              stagesJson: string;
              geographiesJson: string;
              minimumTicket: number | null;
              maximumTicket: number | null;
            }>()
        : Promise.resolve(null),
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM notifications
                WHERE user_id = ? AND read_at IS NULL) AS unreadNotifications,
             (SELECT COUNT(*) FROM connections
                WHERE recipient_id = ? AND status = 'pending') AS pendingConnections`,
        )
        .bind(user.id, user.id)
        .first<{
          unreadNotifications: number;
          pendingConnections: number;
        }>(),
    ]);

  const completion = profile
    ? profileCompletion(profile)
    : { percent: 0, missing: ["profile"] };

  let investorPreferencesComplete = false;
  if (investorState) {
    try {
      const sectors = JSON.parse(investorState.sectorsJson) as unknown;
      const stages = JSON.parse(investorState.stagesJson) as unknown;
      const geographies = JSON.parse(investorState.geographiesJson) as unknown;
      investorPreferencesComplete =
        Array.isArray(sectors) &&
        sectors.length > 0 &&
        Array.isArray(stages) &&
        stages.length > 0 &&
        Array.isArray(geographies) &&
        geographies.length > 0 &&
        investorState.minimumTicket !== null &&
        investorState.maximumTicket !== null;
    } catch {
      investorPreferencesComplete = false;
    }
  }

  const snapshot = {
    accessTier: user.accessTier,
    roles: user.roles.filter(
      (role): role is "founder" | "creator" | "investor" =>
        role === "founder" || role === "creator" || role === "investor",
    ),
    profilePercent: completion.percent,
    profileMissing: completion.missing,
    founderProjectCount: Number(founderState?.projectCount ?? 0),
    founderDraftProjectCount: Number(founderState?.draftProjectCount ?? 0),
    founderPendingClaimCount: Number(founderState?.pendingClaimCount ?? 0),
    xProfileUrl: creatorState?.xProfileUrl ?? "",
    xFollowerCount: creatorState?.xFollowerCount ?? null,
    xScore: creatorState?.xScore ?? null,
    sorsaScore: creatorState?.sorsaScore ?? null,
    investorProfileStatus: investorState?.status ?? null,
    investorPreferencesComplete,
    unreadNotifications: Number(inboxState?.unreadNotifications ?? 0),
    pendingConnections: Number(inboxState?.pendingConnections ?? 0),
  };
  const actions = buildMemberNextActions(snapshot);

  await Promise.all([
    recordActivationShown(db, user.id, actions),
    syncActivationMilestones(db, user.id, snapshot),
  ]);

  return Response.json(
    {
      actions,
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
