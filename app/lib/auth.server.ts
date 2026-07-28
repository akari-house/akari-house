import { redirect } from "react-router";
import {
  adminScopes,
  type AdminAccessLevel,
  type AdminScope,
} from "./admin-workspace";
import type { Role, SessionUser } from "./domain";
import { sha256 } from "./security.server";

const cookieName = "akari_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

type AuthQueryDatabase = Pick<D1Database, "prepare">;

function primaryAuthDatabase(db: D1Database): AuthQueryDatabase {
  const sessionCapable = db as D1Database & {
    withSession?: (constraint: "first-primary") => AuthQueryDatabase;
  };
  return typeof sessionCapable.withSession === "function"
    ? sessionCapable.withSession("first-primary")
    : db;
}

function parseCookie(request: Request) {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== cookieName) continue;
    try {
      return decodeURIComponent(value.join("=")) || null;
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetimeSeconds}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

async function loadRoles(
  db: AuthQueryDatabase,
  userId: string,
): Promise<Role[]> {
  const result = await db
    .prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role")
    .bind(userId)
    .all<{ role: Role }>();
  return result.results.map((row) => row.role);
}

function sessionAdminAccess(
  accessLevel: AdminAccessLevel | null | undefined,
  scopesCsv: string | null | undefined,
): SessionUser["adminAccess"] {
  if (!accessLevel) return undefined;
  const scopes =
    accessLevel === "superadmin"
      ? adminScopes
      : (scopesCsv ?? "")
          .split(",")
          .filter((scope): scope is AdminScope =>
            adminScopes.includes(scope as AdminScope),
          );
  return { accessLevel, scopes };
}

export async function getOptionalUser(
  request: Request,
  db: D1Database,
): Promise<SessionUser | null> {
  const token = parseCookie(request);
  if (!token) return null;

  try {
    const authDb = primaryAuthDatabase(db);
    const tokenHash = await sha256(token);
    const row = await authDb
      .prepare(
        `SELECT u.id, u.username, u.status,
                COALESCE(p.display_name, u.username) AS displayName,
                au.access_level AS adminAccessLevel,
                (SELECT group_concat(scope, ',') FROM admin_scopes
                  WHERE admin_user_id = u.id) AS adminScopesCsv
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN admin_users au ON au.user_id = u.id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')
           AND u.status IN ('active', 'restricted')
           AND u.email_verified_at IS NOT NULL`,
      )
      .bind(tokenHash)
      .first<{
        id: string;
        username: string;
        displayName: string;
        status: "active" | "restricted";
        adminAccessLevel?: AdminAccessLevel | null;
        adminScopesCsv?: string | null;
      }>();
    if (!row) return null;
    const {
      status,
      adminAccessLevel,
      adminScopesCsv,
      ...identity
    } = row;
    const roles = await loadRoles(authDb, row.id);
    const adminAccess = sessionAdminAccess(adminAccessLevel, adminScopesCsv);
    return {
      ...identity,
      accessTier: status === "active" ? "member" : "applicant",
      roles,
      ...(adminAccess ? { adminAccess } : {}),
    };
  } catch (error) {
    console.error(
      "Optional session lookup failed; treating the request as signed out.",
      error,
    );
    return null;
  }
}

export async function requireApprovedMember(request: Request, db: D1Database) {
  const user = await requireUser(request, db);
  if (user.accessTier !== "member")
    throw new Response("Approved membership is required.", { status: 403 });
  return user;
}

export async function requireUser(request: Request, db: D1Database) {
  const user = await getOptionalUser(request, db);
  if (!user)
    throw redirect(
      `/login?returnTo=${encodeURIComponent(new URL(request.url).pathname)}`,
    );
  return user;
}

export async function createSession(
  db: D1Database,
  userId: string,
  request: Request,
) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  await primaryAuthDatabase(db)
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))",
    )
    .bind(sessionId, userId, tokenHash)
    .run();
  return sessionCookie(token, request);
}

export async function destroySession(request: Request, db: D1Database) {
  const token = parseCookie(request);
  if (token)
    await primaryAuthDatabase(db)
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
}
