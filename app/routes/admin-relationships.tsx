import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-relationships";
import { AdminWorkspaceNav } from "~/components/AdminWorkspaceNav";
import { SiteHeader } from "~/components/SiteHeader";
import { loadAdminWorkspaceAccess } from "~/lib/admin-workspace.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { requireSuperAdmin } from "~/lib/membership.server";
import {
  consentStatuses,
  isConsentStatus,
  isRelationshipStatus,
  isRelationshipStrength,
  isRelationshipType,
  relationshipDisplayName,
  relationshipNeedsAttention,
  relationshipStatuses,
  relationshipStrengthLabels,
  relationshipStrengths,
  relationshipTypeLabels,
  relationshipTypes,
  type ConsentStatus,
  type RelationshipStatus,
  type RelationshipStrength,
  type RelationshipType,
} from "~/lib/relationship-intelligence";
import { assertSameOrigin } from "~/lib/security.server";
import { formText, normalizeEmail, validateEmail } from "~/lib/validation";

type RelationshipRow = {
  id: string;
  subjectUserId: string | null;
  memberName: string | null;
  memberUsername: string | null;
  displayName: string;
  email: string;
  companyName: string;
  relationshipType: RelationshipType;
  ownerUserId: string;
  ownerName: string;
  strength: RelationshipStrength;
  status: RelationshipStatus;
  source: string;
  projectId: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  lastInteractionAt: string | null;
  nextActionAt: string | null;
  nextAction: string;
  consentStatus: ConsentStatus;
  updatedAt: string;
  interactionCount: number;
};

type PersonOption = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  roles: string;
};

type OwnerOption = { id: string; username: string; displayName: string };
type ProjectOption = { id: string; title: string; slug: string };

function optionalDate(value: FormDataEntryValue | null) {
  const raw = formText(value).trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return `${raw}T12:00:00Z`;
}

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export const meta: Route.MetaFunction = () => [
  { title: "Relationship Intelligence | AKARI House" },
  {
    name: "description",
    content:
      "Internal relationship ownership, follow-up and network intelligence.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireSuperAdmin(request, db);
  const access = await loadAdminWorkspaceAccess(db, user.id);
  const url = new URL(request.url);
  const query = formText(url.searchParams.get("q")).trim().slice(0, 100);
  const typeFilter = formText(url.searchParams.get("type"));
  const statusFilter = formText(url.searchParams.get("status"));

  const [relationshipsResult, peopleResult, ownerResult, projectResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT rr.id, rr.subject_user_id AS subjectUserId,
                  COALESCE(sp.display_name, su.username) AS memberName,
                  su.username AS memberUsername,
                  rr.display_name AS displayName, rr.email, rr.company_name AS companyName,
                  rr.relationship_type AS relationshipType,
                  rr.owner_user_id AS ownerUserId,
                  COALESCE(op.display_name, ou.username) AS ownerName,
                  rr.strength, rr.status, rr.source,
                  rr.project_id AS projectId, pr.slug AS projectSlug,
                  pr.title AS projectTitle,
                  rr.last_interaction_at AS lastInteractionAt,
                  rr.next_action_at AS nextActionAt, rr.next_action AS nextAction,
                  rr.consent_status AS consentStatus, rr.updated_at AS updatedAt,
                  (SELECT COUNT(*) FROM relationship_interactions ri
                   WHERE ri.relationship_id = rr.id) AS interactionCount
           FROM relationship_records rr
           LEFT JOIN users su ON su.id = rr.subject_user_id
           LEFT JOIN profiles sp ON sp.user_id = su.id
           JOIN users ou ON ou.id = rr.owner_user_id
           LEFT JOIN profiles op ON op.user_id = ou.id
           LEFT JOIN projects pr ON pr.id = rr.project_id
           WHERE (? = '' OR rr.relationship_type = ?)
             AND (? = '' OR rr.status = ?)
             AND (? = '' OR
                  COALESCE(sp.display_name, su.username, '') LIKE '%' || ? || '%' OR
                  rr.display_name LIKE '%' || ? || '%' OR
                  rr.email LIKE '%' || ? || '%' OR
                  rr.company_name LIKE '%' || ? || '%' OR
                  COALESCE(pr.title, '') LIKE '%' || ? || '%')
           ORDER BY
             CASE rr.strength
               WHEN 'trusted' THEN 0 WHEN 'strong' THEN 1 WHEN 'warm' THEN 2
               WHEN 'known' THEN 3 ELSE 4 END,
             COALESCE(rr.next_action_at, '9999-12-31') ASC,
             rr.updated_at DESC
           LIMIT 500`,
        )
        .bind(
          isRelationshipType(typeFilter) ? typeFilter : "",
          isRelationshipType(typeFilter) ? typeFilter : "",
          isRelationshipStatus(statusFilter) ? statusFilter : "",
          isRelationshipStatus(statusFilter) ? statusFilter : "",
          query,
          query,
          query,
          query,
          query,
          query,
        )
        .all<RelationshipRow>(),
      db
        .prepare(
          `SELECT u.id, u.username, u.email,
                  COALESCE(p.display_name, u.username) AS displayName,
                  COALESCE(GROUP_CONCAT(ur.role, ', '), '') AS roles
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
           LEFT JOIN user_roles ur ON ur.user_id = u.id
           WHERE u.status = 'active'
           GROUP BY u.id, u.username, u.email, p.display_name
           ORDER BY displayName, u.username
           LIMIT 500`,
        )
        .all<PersonOption>(),
      db
        .prepare(
          `SELECT u.id, u.username,
                  COALESCE(p.display_name, u.username) AS displayName
           FROM admin_users au
           JOIN users u ON u.id = au.user_id AND u.status = 'active'
           LEFT JOIN profiles p ON p.user_id = u.id
           ORDER BY displayName, u.username`,
        )
        .all<OwnerOption>(),
      db
        .prepare(
          `SELECT id, title, slug FROM projects
           WHERE status <> 'declined'
           ORDER BY updated_at DESC, title
           LIMIT 300`,
        )
        .all<ProjectOption>(),
    ]);

  const now = new Date();
  const relationships = relationshipsResult.results.map((record) => ({
    ...record,
    name: relationshipDisplayName(record),
    needsAttention: relationshipNeedsAttention({
      status: record.status,
      consentStatus: record.consentStatus,
      nextActionAt: record.nextActionAt,
      lastInteractionAt: record.lastInteractionAt,
      now,
    }),
  }));

  return {
    user,
    access,
    relationships,
    people: peopleResult.results,
    owners: ownerResult.results,
    projects: projectResult.results,
    query,
    typeFilter: isRelationshipType(typeFilter) ? typeFilter : "",
    statusFilter: isRelationshipStatus(statusFilter) ? statusFilter : "",
    summary: {
      total: relationships.length,
      attention: relationships.filter((record) => record.needsAttention).length,
      strong: relationships.filter((record) =>
        ["strong", "trusted"].includes(record.strength),
      ).length,
      optedOut: relationships.filter(
        (record) => record.consentStatus === "opted_out",
      ).length,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const admin = await requireSuperAdmin(request, db);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent !== "create")
    throw new Response("Unsupported relationship action.", { status: 400 });

  const subjectUserId = formText(form.get("subjectUserId")).trim() || null;
  let displayName = formText(form.get("displayName")).trim();
  let email = normalizeEmail(form.get("email"));
  const companyName = formText(form.get("companyName")).trim();
  let relationshipType = formText(form.get("relationshipType"));
  const ownerUserId = formText(form.get("ownerUserId")).trim();
  const strength = formText(form.get("strength"));
  const source = formText(form.get("source")).trim();
  const projectId = formText(form.get("projectId")).trim() || null;
  const consentStatus = formText(form.get("consentStatus"));
  const nextActionAt = optionalDate(form.get("nextActionAt"));
  const nextAction = formText(form.get("nextAction")).trim();
  const internalNote = formText(form.get("internalNote")).trim();

  if (!isRelationshipType(relationshipType))
    return { error: "Choose a valid relationship type." };
  if (!isRelationshipStrength(strength))
    return { error: "Choose a valid relationship strength." };
  if (!isConsentStatus(consentStatus))
    return { error: "Choose a valid consent state." };
  if (nextActionAt === undefined)
    return { error: "Use a valid next-action date." };
  if (email && !validateEmail(email))
    return { error: "Enter a valid email or leave it blank." };
  if (
    displayName.length > 160 ||
    companyName.length > 160 ||
    source.length > 300
  )
    return { error: "Check the identity and source field length limits." };
  if (nextAction.length > 500 || internalNote.length > 3000)
    return { error: "Check the next action and internal note length limits." };

  if (subjectUserId) {
    const member = await db
      .prepare(
        `SELECT u.id, u.email, COALESCE(p.display_name, u.username) AS displayName,
                COALESCE(GROUP_CONCAT(ur.role, ','), '') AS roles
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.id = ? AND u.status = 'active'
         GROUP BY u.id, u.email, p.display_name, u.username`,
      )
      .bind(subjectUserId)
      .first<{
        id: string;
        email: string;
        displayName: string;
        roles: string;
      }>();
    if (!member) return { error: "The selected member is no longer active." };
    displayName ||= member.displayName;
    email ||= member.email;
    const roles = member.roles.split(",");
    if (relationshipType === "other") {
      if (roles.includes("investor")) relationshipType = "investor";
      else if (roles.includes("founder")) relationshipType = "founder";
      else if (roles.includes("creator")) relationshipType = "creator";
    }
  }

  if (!subjectUserId && !displayName && !email)
    return { error: "Choose a member or enter an external person name/email." };

  const owner = await db
    .prepare(
      `SELECT au.user_id AS id FROM admin_users au
       JOIN users u ON u.id = au.user_id AND u.status = 'active'
       WHERE au.user_id = ?`,
    )
    .bind(ownerUserId)
    .first<{ id: string }>();
  if (!owner) return { error: "Choose an active AKARI relationship owner." };

  if (projectId) {
    const project = await db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .bind(projectId)
      .first<{ id: string }>();
    if (!project) return { error: "The selected Project no longer exists." };
  }

  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO relationship_records
         (id, subject_user_id, display_name, email, company_name,
          relationship_type, owner_user_id, strength, status, source,
          project_id, next_action_at, next_action, consent_status,
          internal_note, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        subjectUserId,
        displayName,
        email,
        companyName,
        relationshipType,
        owner.id,
        strength,
        source,
        projectId,
        nextActionAt,
        nextAction,
        consentStatus,
        internalNote,
        admin.id,
        admin.id,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id, metadata_json)
         VALUES (?, ?, 'relationship.created', 'relationship', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        admin.id,
        id,
        JSON.stringify({
          subjectUserId,
          relationshipType,
          ownerUserId: owner.id,
          strength,
          projectId,
          consentStatus,
        }),
      ),
  ]);

  return { saved: true, relationshipId: id };
}

export default function AdminRelationships({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const [searchParams] = useSearchParams();

  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main">
        <AdminWorkspaceNav access={loaderData.access} />
        <header className="admin-heading">
          <div>
            <span className="eyebrow">R73 · Relationship intelligence</span>
            <h1>Relationship ownership and 360° context</h1>
            <p>
              Internal CRM intelligence across members, external counterparties,
              Projects and follow-up history. Relationship strength is a human
              operational label, not an objective quality score.
            </p>
          </div>
        </header>

        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.saved && (
          <p className="notice success" role="status">
            Relationship saved.
          </p>
        )}

        <section
          className="admin-summary-grid"
          aria-label="Relationship summary"
        >
          <article className="status-card">
            <span className="chapter">Records</span>
            <h2>{loaderData.summary.total}</h2>
          </article>
          <article className="status-card">
            <span className="chapter">Needs attention</span>
            <h2>{loaderData.summary.attention}</h2>
          </article>
          <article className="status-card">
            <span className="chapter">Strong / trusted</span>
            <h2>{loaderData.summary.strong}</h2>
          </article>
          <article className="status-card">
            <span className="chapter">Opted out</span>
            <h2>{loaderData.summary.optedOut}</h2>
          </article>
        </section>

        <section className="status-card">
          <span className="chapter">Create relationship</span>
          <h2>Assign an owner before outreach</h2>
          <Form method="post" className="form-grid" aria-busy={pending}>
            <input type="hidden" name="intent" value="create" />
            <label className="field">
              <span>Existing member</span>
              <select name="subjectUserId" defaultValue="">
                <option value="">External person / not a member</option>
                {loaderData.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName} (@{person.username})
                    {person.roles ? ` · ${person.roles}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>External / fallback name</span>
              <input name="displayName" maxLength={160} />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" maxLength={254} />
            </label>
            <label className="field">
              <span>Company</span>
              <input name="companyName" maxLength={160} />
            </label>
            <label className="field">
              <span>Relationship type</span>
              <select name="relationshipType" defaultValue="other">
                {relationshipTypes.map((type) => (
                  <option key={type} value={type}>
                    {relationshipTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>AKARI owner</span>
              <select
                name="ownerUserId"
                required
                defaultValue={loaderData.user.id}
              >
                {loaderData.owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.displayName} (@{owner.username})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Strength</span>
              <select name="strength" defaultValue="known">
                {relationshipStrengths.map((strength) => (
                  <option key={strength} value={strength}>
                    {relationshipStrengthLabels[strength]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Consent</span>
              <select name="consentStatus" defaultValue="unknown">
                {consentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Source / how we met</span>
              <input
                name="source"
                maxLength={300}
                placeholder="Founder Space, referral, event..."
              />
            </label>
            <label className="field">
              <span>Related Project</span>
              <select name="projectId" defaultValue="">
                <option value="">No Project</option>
                {loaderData.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Next action date</span>
              <input name="nextActionAt" type="date" />
            </label>
            <label className="field">
              <span>Next action</span>
              <input name="nextAction" maxLength={500} />
            </label>
            <label className="field field-full">
              <span>Internal note</span>
              <textarea name="internalNote" rows={3} maxLength={3000} />
            </label>
            <div className="application-actions">
              <button
                className="button button-primary"
                type="submit"
                disabled={pending}
              >
                Create relationship
              </button>
            </div>
          </Form>
        </section>

        <section className="status-card">
          <span className="chapter">Filter</span>
          <Form method="get" className="form-grid">
            <label className="field">
              <span>Search</span>
              <input name="q" defaultValue={loaderData.query} />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="type" defaultValue={loaderData.typeFilter}>
                <option value="">All types</option>
                {relationshipTypes.map((type) => (
                  <option key={type} value={type}>
                    {relationshipTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue={loaderData.statusFilter}>
                <option value="">All statuses</option>
                {relationshipStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <div className="application-actions">
              <button className="button button-quiet" type="submit">
                Apply filters
              </button>
              {searchParams.toString() && (
                <Link className="button button-quiet" to="/admin/relationships">
                  Clear
                </Link>
              )}
            </div>
          </Form>
        </section>

        <div className="application-list">
          {loaderData.relationships.map((record) => (
            <article className="application-card" key={record.id}>
              <div>
                <span className="chapter">
                  {relationshipTypeLabels[record.relationshipType]} ·{" "}
                  {relationshipStrengthLabels[record.strength]} ·{" "}
                  {record.status}
                  {record.needsAttention ? " · attention" : ""}
                </span>
                <h2>{record.name}</h2>
                <p>
                  {record.companyName ||
                    record.projectTitle ||
                    "No company / Project linked"}
                </p>
                <p>
                  Owner: {record.ownerName} · Last interaction:{" "}
                  {dateLabel(record.lastInteractionAt)} · Interactions:{" "}
                  {record.interactionCount}
                </p>
                <p>
                  Next: {record.nextAction || "No action recorded"}
                  {record.nextActionAt
                    ? ` · ${dateLabel(record.nextActionAt)}`
                    : ""}
                </p>
                <small>
                  Consent: {record.consentStatus.replace("_", " ")}
                  {record.source ? ` · Source: ${record.source}` : ""}
                </small>
              </div>
              <div className="application-actions">
                <Link
                  className="button button-primary"
                  to={`/admin/relationships/${record.id}`}
                >
                  Open 360° view
                </Link>
                {record.memberUsername && (
                  <Link
                    className="button button-quiet"
                    to={`/profiles/${record.memberUsername}`}
                  >
                    Member profile
                  </Link>
                )}
                {record.projectSlug && (
                  <Link
                    className="button button-quiet"
                    to={`/projects/${record.projectSlug}`}
                  >
                    Project
                  </Link>
                )}
              </div>
            </article>
          ))}
          {!loaderData.relationships.length && (
            <p>No relationship records match these filters.</p>
          )}
        </div>
      </main>
    </div>
  );
}
