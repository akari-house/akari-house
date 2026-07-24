import type { Route } from "./+types/account-export";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);

  const [
    account,
    roles,
    profile,
    contacts,
    social,
    connections,
    projects,
    follows,
    events,
    campaigns,
    notifications,
    legal,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT id, email, username, status, email_verified_at AS emailVerifiedAt,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM users WHERE id = ?`,
      )
      .bind(user.id)
      .first(),
    db
      .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT display_name AS displayName, headline, bio, location,
                  website_url AS websiteUrl, expertise, open_to AS openTo,
                  visibility, created_at AS createdAt, updated_at AS updatedAt
           FROM profiles WHERE user_id = ?`,
      )
      .bind(user.id)
      .first(),
    db
      .prepare(
        `SELECT contact_type AS contactType, contact_value AS contactValue,
                  visibility, created_at AS createdAt, updated_at AS updatedAt
           FROM profile_contacts WHERE user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT platform, profile_url AS profileUrl, follower_count AS followerCount,
                  sync_status AS syncStatus, updated_at AS updatedAt
           FROM social_accounts WHERE user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT id, requester_id AS requesterId, recipient_id AS recipientId,
                  status, created_at AS createdAt, updated_at AS updatedAt
           FROM connections WHERE requester_id = ? OR recipient_id = ?`,
      )
      .bind(user.id, user.id)
      .all(),
    db
      .prepare(
        `SELECT id, slug, title, summary, story, stage, seeking, status,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM projects WHERE founder_user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT project_id AS projectId, created_at AS createdAt
           FROM project_follows WHERE user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT event_id AS eventId, status, created_at AS createdAt,
                  updated_at AS updatedAt
           FROM event_registrations WHERE user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT campaign_id AS campaignId, status, created_at AS createdAt,
                  updated_at AS updatedAt
           FROM campaign_applications WHERE creator_user_id = ?`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT kind, title, body, action_url AS actionUrl,
                  read_at AS readAt, created_at AS createdAt
           FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .bind(user.id)
      .all(),
    db
      .prepare(
        `SELECT policy, action, policy_version AS policyVersion,
                  accepted_at AS acceptedAt
           FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at`,
      )
      .bind(user.id)
      .all(),
  ]);

  const exportId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const payload = {
    exportVersion: "1.0",
    generatedAt,
    account,
    roles: roles.results,
    profile,
    contacts: contacts.results,
    socialAccounts: social.results,
    connections: connections.results,
    projects: projects.results,
    followedProjects: follows.results,
    eventRegistrations: events.results,
    campaignApplications: campaigns.results,
    notifications: notifications.results,
    legalAcceptances: legal.results,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO data_export_requests
         (id, user_id, status, completed_at, expires_at, metadata_json)
         VALUES (?, ?, 'completed', datetime('now'), datetime('now', '+30 days'), ?)`,
      )
      .bind(exportId, user.id, JSON.stringify({ format: "json", generatedAt })),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'account.data_exported', 'user', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        user.id,
        JSON.stringify({ exportId, format: "json" }),
      ),
  ]);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="akari-account-${user.username}-${generatedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
