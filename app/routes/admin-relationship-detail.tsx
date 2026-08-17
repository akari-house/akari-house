import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin-relationship-detail";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import {
  consentStatuses,
  interactionTypes,
  isConsentStatus,
  isInteractionType,
  isRelationshipStatus,
  isRelationshipStrength,
  isRelationshipType,
  prioritizeWarmPaths,
  relationshipDisplayName,
  relationshipNeedsAttention,
  relationshipStatuses,
  relationshipStrengthLabels,
  relationshipStrengths,
  relationshipTypeLabels,
  relationshipTypes,
  type ConsentStatus,
  type InteractionType,
  type RelationshipStatus,
  type RelationshipStrength,
  type RelationshipType,
} from "~/lib/relationship-intelligence";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeEmail, validateEmail } from "~/lib/validation";

type RelationshipRecord = {
  id: string;
  subjectUserId: string | null;
  memberName: string | null;
  memberUsername: string | null;
  memberEmail: string | null;
  displayName: string;
  email: string;
  companyName: string;
  relationshipType: RelationshipType;
  ownerUserId: string;
  ownerName: string;
  ownerUsername: string;
  strength: RelationshipStrength;
  status: RelationshipStatus;
  source: string;
  introducedByUserId: string | null;
  introducedByName: string | null;
  introducedByUsername: string | null;
  projectId: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  nextAction: string;
  consentStatus: ConsentStatus;
  conflictNote: string;
  internalNote: string;
  createdAt: string;
  updatedAt: string;
};

type InteractionRow = {
  id: string;
  interactionType: InteractionType;
  summary: string;
  occurredAt: string;
  projectId: string | null;
  projectTitle: string | null;
  createdByName: string;
  createdByUsername: string;
  createdAt: string;
};

type OwnerOption = { id: string; displayName: string; username: string };
type PersonOption = { id: string; displayName: string; username: string };
type ProjectOption = { id: string; title: string; slug: string };
type ProjectRelationshipRow = {
  projectId: string;
  title: string;
  slug: string;
  relationshipType: string;
  claimStatus: string;
};

type RelatedSummary = {
  opportunityStatus: string | null;
  campaigns: number;
  agreements: number;
  introductions: number;
  activeDataRoomGrants: number;
};

function optionalDate(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return `${raw}T12:00:00Z`;
}

function dateInputValue(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

function dateTimeLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export const meta: Route.MetaFunction = () => [
  { title: "Relationship 360° | AKARI House" },
  { name: "description", content: "Internal relationship timeline, warm paths and connected AKARI activity." },
];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const relationshipId = formText(params.relationshipId).trim();

  const relationship = await db
    .prepare(
      `SELECT rr.id, rr.subject_user_id AS subjectUserId,
              COALESCE(sp.display_name, su.username) AS memberName,
              su.username AS memberUsername, su.email AS memberEmail,
              rr.display_name AS displayName, rr.email, rr.company_name AS companyName,
              rr.relationship_type AS relationshipType,
              rr.owner_user_id AS ownerUserId,
              COALESCE(op.display_name, ou.username) AS ownerName,
              ou.username AS ownerUsername,
              rr.strength, rr.status, rr.source,
              rr.introduced_by_user_id AS introducedByUserId,
              COALESCE(ip.display_name, iu.username) AS introducedByName,
              iu.username AS introducedByUsername,
              rr.project_id AS projectId, pr.title AS projectTitle, pr.slug AS projectSlug,
              rr.first_interaction_at AS firstInteractionAt,
              rr.last_interaction_at AS lastInteractionAt,
              rr.next_action_at AS nextActionAt, rr.next_action AS nextAction,
              rr.consent_status AS consentStatus, rr.conflict_note AS conflictNote,
              rr.internal_note AS internalNote, rr.created_at AS createdAt,
              rr.updated_at AS updatedAt
       FROM relationship_records rr
       LEFT JOIN users su ON su.id = rr.subject_user_id
       LEFT JOIN profiles sp ON sp.user_id = su.id
       JOIN users ou ON ou.id = rr.owner_user_id
       LEFT JOIN profiles op ON op.user_id = ou.id
       LEFT JOIN users iu ON iu.id = rr.introduced_by_user_id
       LEFT JOIN profiles ip ON ip.user_id = iu.id
       LEFT JOIN projects pr ON pr.id = rr.project_id
       WHERE rr.id = ?`,
    )
    .bind(relationshipId)
    .first<RelationshipRecord>();
  if (!relationship) throw new Response("Relationship not found.", { status: 404 });

  const [interactionResult, ownerResult, peopleResult, projectResult] = await Promise.all([
    db.prepare(
      `SELECT ri.id, ri.interaction_type AS interactionType, ri.summary,
              ri.occurred_at AS occurredAt, ri.project_id AS projectId,
              pr.title AS projectTitle,
              COALESCE(cp.display_name, cu.username) AS createdByName,
              cu.username AS createdByUsername, ri.created_at AS createdAt
       FROM relationship_interactions ri
       JOIN users cu ON cu.id = ri.created_by
       LEFT JOIN profiles cp ON cp.user_id = cu.id
       LEFT JOIN projects pr ON pr.id = ri.project_id
       WHERE ri.relationship_id = ?
       ORDER BY ri.occurred_at DESC, ri.created_at DESC LIMIT 250`,
    ).bind(relationship.id).all<InteractionRow>(),
    db.prepare(
      `SELECT u.id, u.username, COALESCE(p.display_name, u.username) AS displayName
       FROM admin_users au JOIN users u ON u.id = au.user_id AND u.status = 'active'
       LEFT JOIN profiles p ON p.user_id = u.id ORDER BY displayName, u.username`,
    ).all<OwnerOption>(),
    db.prepare(
      `SELECT u.id, u.username, COALESCE(p.display_name, u.username) AS displayName
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.status = 'active' ORDER BY displayName, u.username LIMIT 500`,
    ).all<PersonOption>(),
    db.prepare(
      `SELECT id, title, slug FROM projects WHERE status <> 'declined'
       ORDER BY updated_at DESC, title LIMIT 300`,
    ).all<ProjectOption>(),
  ]);

  let warmPaths: Array<{ userId: string; displayName: string; username: string; isOwner: boolean }> = [];
  let projectRelationships: ProjectRelationshipRow[] = [];
  if (relationship.subjectUserId) {
    const [warmResult, projectRelationshipResult] = await Promise.all([
      db.prepare(
        `SELECT au.user_id AS userId, COALESCE(p.display_name, u.username) AS displayName, u.username
         FROM admin_users au
         JOIN users u ON u.id = au.user_id AND u.status = 'active'
         LEFT JOIN profiles p ON p.user_id = u.id
         JOIN connections c ON c.status = 'accepted'
          AND ((c.requester_id = au.user_id AND c.recipient_id = ?)
            OR (c.recipient_id = au.user_id AND c.requester_id = ?))
         WHERE au.user_id <> ?
         GROUP BY au.user_id, p.display_name, u.username
         ORDER BY displayName, u.username`,
      ).bind(relationship.subjectUserId, relationship.subjectUserId, relationship.subjectUserId)
        .all<{ userId: string; displayName: string; username: string }>(),
      db.prepare(
        `SELECT pr.project_id AS projectId, p.title, p.slug,
                pr.relationship_type AS relationshipType, pr.claim_status AS claimStatus
         FROM project_relationships pr JOIN projects p ON p.id = pr.project_id
         WHERE pr.user_id = ? AND pr.claim_status <> 'revoked'
         ORDER BY pr.updated_at DESC`,
      ).bind(relationship.subjectUserId).all<ProjectRelationshipRow>(),
    ]);
    warmPaths = prioritizeWarmPaths(warmResult.results.map((candidate) => ({
      ...candidate,
      isOwner: candidate.userId === relationship.ownerUserId,
    })));
    projectRelationships = projectRelationshipResult.results;
  }

  let related: RelatedSummary = {
    opportunityStatus: null,
    campaigns: 0,
    agreements: 0,
    introductions: 0,
    activeDataRoomGrants: 0,
  };
  if (relationship.projectId) {
    const row = await db.prepare(
      `SELECT
         (SELECT status FROM opportunity_listings WHERE project_id = ?) AS opportunityStatus,
         (SELECT COUNT(*) FROM ambassador_campaigns WHERE project_id = ?) AS campaigns,
         (SELECT COUNT(*) FROM agreement_records WHERE project_id = ?) AS agreements,
         (SELECT COUNT(*) FROM introduction_requests
           WHERE project_id = ? AND (? IS NULL OR investor_user_id = ?)) AS introductions,
         (SELECT COUNT(*) FROM document_access_grants
           WHERE project_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')
             AND (? IS NULL OR investor_user_id = ?)) AS activeDataRoomGrants`,
    ).bind(
      relationship.projectId,
      relationship.projectId,
      relationship.projectId,
      relationship.projectId,
      relationship.subjectUserId,
      relationship.subjectUserId,
      relationship.projectId,
      relationship.subjectUserId,
      relationship.subjectUserId,
    ).first<RelatedSummary>();
    if (row) related = row;
  }

  return {
    user,
    access,
    relationship: {
      ...relationship,
      name: relationshipDisplayName(relationship),
      needsAttention: relationshipNeedsAttention({
        status: relationship.status,
        consentStatus: relationship.consentStatus,
        nextActionAt: relationship.nextActionAt,
        lastInteractionAt: relationship.lastInteractionAt,
      }),
    },
    interactions: interactionResult.results,
    owners: ownerResult.results,
    people: peopleResult.results,
    projects: projectResult.results,
    warmPaths,
    projectRelationships,
    related,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireSuperAdmin(request, db);
  const relationshipId = formText(params.relationshipId).trim();
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  const existing = await db.prepare(
    `SELECT id, subject_user_id AS subjectUserId, project_id AS projectId
     FROM relationship_records WHERE id = ?`,
  ).bind(relationshipId).first<{ id: string; subjectUserId: string | null; projectId: string | null }>();
  if (!existing) throw new Response("Relationship not found.", { status: 404 });

  if (intent === "add-interaction") {
    const interactionType = formText(form.get("interactionType"));
    const summary = formText(form.get("summary")).trim();
    const occurredDate = optionalDate(form.get("occurredAt"));
    const projectId = formText(form.get("interactionProjectId")).trim() || existing.projectId;
    if (!isInteractionType(interactionType)) return { error: "Choose a valid interaction type." };
    if (summary.length < 2 || summary.length > 2000) return { error: "Interaction summary must be between 2 and 2,000 characters." };
    if (occurredDate === undefined) return { error: "Use a valid interaction date." };
    const occurredAt = occurredDate ?? new Date().toISOString();
    if (projectId) {
      const project = await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first<{ id: string }>();
      if (!project) return { error: "The selected Project no longer exists." };
    }
    const interactionId = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `INSERT INTO relationship_interactions
         (id, relationship_id, interaction_type, summary, occurred_at, project_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(interactionId, relationshipId, interactionType, summary, occurredAt, projectId, admin.id),
      db.prepare(
        `UPDATE relationship_records SET updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(admin.id, relationshipId),
      db.prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'relationship.interaction_added', 'relationship', ?, ?)`,
      ).bind(crypto.randomUUID(), admin.id, relationshipId, JSON.stringify({ interactionId, interactionType, projectId, occurredAt })),
    ]);
    return { saved: true, kind: "interaction" };
  }

  if (intent !== "update") throw new Response("Unsupported relationship action.", { status: 400 });
  const displayName = formText(form.get("displayName")).trim();
  const email = normalizeEmail(form.get("email"));
  const companyName = formText(form.get("companyName")).trim();
  const relationshipType = formText(form.get("relationshipType"));
  const ownerUserId = formText(form.get("ownerUserId")).trim();
  const strength = formText(form.get("strength"));
  const status = formText(form.get("status"));
  const source = formText(form.get("source")).trim();
  const introducedByUserId = formText(form.get("introducedByUserId")).trim() || null;
  const projectId = formText(form.get("projectId")).trim() || null;
  const nextActionAt = optionalDate(form.get("nextActionAt"));
  const nextAction = formText(form.get("nextAction")).trim();
  const consentStatus = formText(form.get("consentStatus"));
  const conflictNote = formText(form.get("conflictNote")).trim();
  const internalNote = formText(form.get("internalNote")).trim();
  if (!isRelationshipType(relationshipType)) return { error: "Choose a valid relationship type." };
  if (!isRelationshipStrength(strength)) return { error: "Choose a valid relationship strength." };
  if (!isRelationshipStatus(status)) return { error: "Choose a valid relationship status." };
  if (!isConsentStatus(consentStatus)) return { error: "Choose a valid consent state." };
  if (nextActionAt === undefined) return { error: "Use a valid next-action date." };
  if (email && !validateEmail(email)) return { error: "Enter a valid email or leave it blank." };
  if (!existing.subjectUserId && !displayName && !email) return { error: "External relationships need a name or email." };
  if (displayName.length > 160 || companyName.length > 160 || source.length > 300) return { error: "Check the identity and source field length limits." };
  if (nextAction.length > 500 || conflictNote.length > 2000 || internalNote.length > 3000) return { error: "Check the next action and internal note length limits." };

  const owner = await db.prepare(
    `SELECT au.user_id AS id FROM admin_users au
     JOIN users u ON u.id = au.user_id AND u.status = 'active'
     WHERE au.user_id = ?`,
  ).bind(ownerUserId).first<{ id: string }>();
  if (!owner) return { error: "Choose an active AKARI relationship owner." };
  if (introducedByUserId) {
    const introducer = await db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").bind(introducedByUserId).first<{ id: string }>();
    if (!introducer) return { error: "The selected introducer is no longer active." };
  }
  if (projectId) {
    const project = await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first<{ id: string }>();
    if (!project) return { error: "The selected Project no longer exists." };
  }

  await db.batch([
    db.prepare(
      `UPDATE relationship_records
       SET display_name = ?, email = ?, company_name = ?, relationship_type = ?,
           owner_user_id = ?, strength = ?, status = ?, source = ?,
           introduced_by_user_id = ?, project_id = ?, next_action_at = ?,
           next_action = ?, consent_status = ?, conflict_note = ?, internal_note = ?,
           updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(displayName, email, companyName, relationshipType, owner.id, strength, status, source, introducedByUserId, projectId, nextActionAt, nextAction, consentStatus, conflictNote, internalNote, admin.id, relationshipId),
    db.prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id, metadata_json)
       VALUES (?, ?, 'relationship.updated', 'relationship', ?, ?)`,
    ).bind(crypto.randomUUID(), admin.id, relationshipId, JSON.stringify({ relationshipType, ownerUserId: owner.id, strength, status, projectId, consentStatus, introducedByUserId })),
  ]);
  return { saved: true, kind: "relationship" };
}

export default function AdminRelationshipDetail({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const record = loaderData.relationship;
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Internal relationship intelligence</span>
            <h1>{record.name}</h1>
            <p>{relationshipTypeLabels[record.relationshipType]} · {relationshipStrengthLabels[record.strength]} · Owner {record.ownerName}{record.needsAttention ? " · Needs attention" : ""}</p>
          </div>
          <div className="application-actions">
            <Link className="button button-quiet" to="/admin/relationships">All relationships</Link>
            {record.memberUsername && <Link className="button button-quiet" to={`/profiles/${record.memberUsername}`}>Member profile</Link>}
            {record.projectSlug && <Link className="button button-primary" to={`/projects/${record.projectSlug}`}>Open Project</Link>}
          </div>
        </header>
        {actionData?.error && <p className="notice error" role="alert">{actionData.error}</p>}
        {actionData?.saved && <p className="notice success" role="status">{actionData.kind === "interaction" ? "Interaction added." : "Relationship updated."}</p>}

        <section className="admin-summary-grid" aria-label="Relationship summary">
          <article className="status-card"><span className="chapter">Owner</span><h2>{record.ownerName}</h2><p>@{record.ownerUsername}</p></article>
          <article className="status-card"><span className="chapter">Last interaction</span><h2>{dateTimeLabel(record.lastInteractionAt)}</h2></article>
          <article className="status-card"><span className="chapter">Next action</span><h2>{record.nextAction || "Not set"}</h2><p>{dateTimeLabel(record.nextActionAt)}</p></article>
          <article className="status-card"><span className="chapter">Consent</span><h2>{record.consentStatus.replace("_", " ")}</h2></article>
        </section>

        <section className="status-card">
          <span className="chapter">Connected AKARI activity</span><h2>360° account context</h2>
          <p>Opportunity: {loaderData.related.opportunityStatus ?? "none"} · Campaigns: {loaderData.related.campaigns} · Agreements: {loaderData.related.agreements} · Introductions: {loaderData.related.introductions} · Active Data Room grants: {loaderData.related.activeDataRoomGrants}</p>
          {loaderData.projectRelationships.length > 0 && <div className="application-list">{loaderData.projectRelationships.map((item) => <article className="application-card" key={item.projectId}><div><span className="chapter">{item.relationshipType} · {item.claimStatus}</span><h3>{item.title}</h3></div><Link className="button button-quiet" to={`/projects/${item.slug}`}>Project</Link></article>)}</div>}
        </section>

        <section className="status-card">
          <span className="chapter">Warm path finder</span><h2>Recorded paths, never guessed</h2>
          <p>Paths come only from accepted AKARI member connections and the recorded introducer. They are operational context, not an automated relationship score.</p>
          {record.introducedByName && <p><strong>Recorded introducer:</strong> {record.introducedByName}{record.introducedByUsername ? ` (@${record.introducedByUsername})` : ""}</p>}
          {loaderData.warmPaths.length > 0 ? <div className="application-list">{loaderData.warmPaths.map((path) => <article className="application-card" key={path.userId}><div><span className="chapter">{path.isOwner ? "Relationship owner · direct connection" : "Direct accepted connection"}</span><h3>{path.displayName}</h3><p>@{path.username} → {record.name}</p></div><Link className="button button-quiet" to={`/profiles/${path.username}`}>Profile</Link></article>)}</div> : <p>No direct accepted AKARI-admin connection is recorded for this person.</p>}
        </section>

        <section className="status-card">
          <span className="chapter">Relationship record</span><h2>Ownership, source and follow-up</h2>
          <Form method="post" className="form-grid" aria-busy={pending}>
            <input type="hidden" name="intent" value="update" />
            <label className="field"><span>Fallback / external name</span><input name="displayName" defaultValue={record.displayName} maxLength={160} /></label>
            <label className="field"><span>Email</span><input type="email" name="email" defaultValue={record.email} maxLength={254} /></label>
            <label className="field"><span>Company</span><input name="companyName" defaultValue={record.companyName} maxLength={160} /></label>
            <label className="field"><span>Type</span><select name="relationshipType" defaultValue={record.relationshipType}>{relationshipTypes.map((type) => <option key={type} value={type}>{relationshipTypeLabels[type]}</option>)}</select></label>
            <label className="field"><span>Owner</span><select name="ownerUserId" defaultValue={record.ownerUserId}>{loaderData.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName} (@{owner.username})</option>)}</select></label>
            <label className="field"><span>Strength</span><select name="strength" defaultValue={record.strength}>{relationshipStrengths.map((strength) => <option key={strength} value={strength}>{relationshipStrengthLabels[strength]}</option>)}</select></label>
            <label className="field"><span>Status</span><select name="status" defaultValue={record.status}>{relationshipStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            <label className="field"><span>Consent</span><select name="consentStatus" defaultValue={record.consentStatus}>{consentStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select></label>
            <label className="field"><span>Source / how we met</span><input name="source" defaultValue={record.source} maxLength={300} /></label>
            <label className="field"><span>Introduced by</span><select name="introducedByUserId" defaultValue={record.introducedByUserId ?? ""}><option value="">Not recorded</option>{loaderData.people.map((person) => <option key={person.id} value={person.id}>{person.displayName} (@{person.username})</option>)}</select></label>
            <label className="field"><span>Related Project</span><select name="projectId" defaultValue={record.projectId ?? ""}><option value="">No Project</option>{loaderData.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label className="field"><span>Next action date</span><input type="date" name="nextActionAt" defaultValue={dateInputValue(record.nextActionAt)} /></label>
            <label className="field field-full"><span>Next action</span><input name="nextAction" defaultValue={record.nextAction} maxLength={500} /></label>
            <label className="field field-full"><span>Conflict / coordination note</span><textarea name="conflictNote" defaultValue={record.conflictNote} rows={3} maxLength={2000} /></label>
            <label className="field field-full"><span>Internal note</span><textarea name="internalNote" defaultValue={record.internalNote} rows={5} maxLength={3000} /></label>
            <div className="application-actions"><button className="button button-primary" type="submit" disabled={pending}>Save relationship</button></div>
          </Form>
        </section>

        <section className="status-card">
          <span className="chapter">Interaction timeline</span><h2>Record what actually happened</h2>
          <Form method="post" className="form-grid" aria-busy={pending}>
            <input type="hidden" name="intent" value="add-interaction" />
            <label className="field"><span>Type</span><select name="interactionType" defaultValue="note">{interactionTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="field"><span>Date</span><input type="date" name="occurredAt" /></label>
            <label className="field"><span>Project</span><select name="interactionProjectId" defaultValue={record.projectId ?? ""}><option value="">No Project</option>{loaderData.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label className="field field-full"><span>Summary</span><textarea name="summary" required minLength={2} maxLength={2000} rows={3} placeholder="Meeting outcome, introduction, Telegram follow-up, Space attendance..." /></label>
            <div className="application-actions"><button className="button button-primary" type="submit" disabled={pending}>Add interaction</button></div>
          </Form>
          <div className="application-list">{loaderData.interactions.map((interaction) => <article className="application-card" key={interaction.id}><div><span className="chapter">{interaction.interactionType} · {dateTimeLabel(interaction.occurredAt)}</span><h3>{interaction.summary}</h3><p>Recorded by {interaction.createdByName} (@{interaction.createdByUsername}){interaction.projectTitle ? ` · ${interaction.projectTitle}` : ""}</p></div></article>)}{!loaderData.interactions.length && <p>No interactions recorded yet.</p>}</div>
        </section>
      </main>
    </div>
  );
}
