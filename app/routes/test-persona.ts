import type { Route } from "./+types/test-persona";
import { createSession } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import type { Role } from "~/lib/domain";
import { hashPassword } from "~/lib/security.server";

const fixtureHeader = "launch-gate-v1";

const personaSpecs: Record<
  string,
  {
    status: "active" | "restricted" | "suspended";
    roles: Role[];
    membership: "approved" | "pending_review";
    admin?: "membership" | "campaigns" | "superadmin";
    privateProfile?: boolean;
    invalidateSession?: boolean;
  }
> = {
  applicant: {
    status: "restricted",
    roles: ["founder"],
    membership: "pending_review",
  },
  founder: { status: "active", roles: ["founder"], membership: "approved" },
  creator: { status: "active", roles: ["creator"], membership: "approved" },
  investor: {
    status: "active",
    roles: ["investor"],
    membership: "approved",
  },
  multi_role: {
    status: "active",
    roles: ["founder", "creator", "investor"],
    membership: "approved",
  },
  scoped_admin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "membership",
  },
  campaign_admin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "campaigns",
  },
  superadmin: {
    status: "active",
    roles: [],
    membership: "approved",
    admin: "superadmin",
  },
  suspended: {
    status: "suspended",
    roles: ["founder"],
    membership: "approved",
  },
  blocked: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    invalidateSession: true,
  },
  private_target: {
    status: "active",
    roles: ["founder"],
    membership: "approved",
    privateProfile: true,
  },
};

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
  const persona = params.persona ?? "";
  const spec = personaSpecs[persona];
  if (!spec) throw new Response("Unknown persona", { status: 400 });

  const form = await request.formData();
  const createPersonaSession = form.get("session") !== "false";
  const env = context.get(cloudflareContext).env;
  const db = env.DB;
  const username = `launch-gate-${persona.replaceAll("_", "-")}`;
  const email = `${username}@example.test`;
  const existing = await db
    .prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
  if (existing)
    await db.prepare("DELETE FROM users WHERE id = ?").bind(existing.id).run();

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword("Launch-gate-test-password-2026");
  const visibility = spec.privateProfile ? "private" : "members";
  const avatarKey = spec.privateProfile ? `launch-gate/${username}.txt` : null;
  const statements = [
    db
      .prepare(
        `INSERT INTO users
         (id, email, username, password_hash, status, email_verified_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(userId, email, username, passwordHash, spec.status),
    db
      .prepare(
        `INSERT INTO profiles (user_id, display_name, visibility, avatar_key)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        userId,
        `Launch Gate ${persona.replaceAll("_", " ")}`,
        visibility,
        avatarKey,
      ),
    db
      .prepare(
        `INSERT INTO profile_visibility (user_id, visibility) VALUES (?, ?)`,
      )
      .bind(userId, visibility),
    db
      .prepare(
        `INSERT INTO membership_applications
         (id, user_id, status, applicant_note)
         VALUES (?, ?, ?, 'Automated launch-gate fixture account.')`,
      )
      .bind(crypto.randomUUID(), userId, spec.membership),
    ...spec.roles.map((role) =>
      db
        .prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)")
        .bind(userId, role),
    ),
    ...spec.roles.map((role) =>
      db
        .prepare(
          `INSERT INTO role_verifications
           (user_id, role, status, reviewed_at)
           VALUES (?, ?, 'verified', datetime('now'))`,
        )
        .bind(userId, role),
    ),
  ];
  await db.batch(statements);

  if (avatarKey)
    await env.MEDIA.put(avatarKey, "private launch-gate fixture", {
      httpMetadata: { contentType: "text/plain" },
    });

  if (spec.admin === "superadmin")
    await db
      .prepare(
        `INSERT INTO admin_users (user_id, access_level)
         VALUES (?, 'superadmin')`,
      )
      .bind(userId)
      .run();
  else if (spec.admin) {
    await db.batch([
      db
        .prepare(
          `INSERT INTO admin_users (user_id, access_level) VALUES (?, 'admin')`,
        )
        .bind(userId),
      db
        .prepare(
          `INSERT INTO admin_scopes (admin_user_id, scope, granted_by)
           VALUES (?, ?, ?)`,
        )
        .bind(userId, spec.admin, userId),
    ]);
  }

  let cookie: string | null = null;
  if (createPersonaSession) cookie = await createSession(db, userId, request);
  if (spec.invalidateSession)
    await db
      .prepare("DELETE FROM sessions WHERE user_id = ?")
      .bind(userId)
      .run();

  return new Response(
    JSON.stringify({ persona, userId, username, session: Boolean(cookie) }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    },
  );
}
