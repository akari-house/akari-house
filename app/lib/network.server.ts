import type { SessionUser } from "./domain";

export type ConnectionState =
  "none" | "outgoing_pending" | "incoming_pending" | "connected" | "blocked";

export function connectionStateFromRow(
  row: { requesterId: string; status: string } | null,
  viewerId: string,
): ConnectionState {
  if (!row || row.status === "declined") return "none";
  if (row.status === "blocked") return "blocked";
  if (row.status === "accepted") return "connected";
  if (row.status !== "pending") return "none";
  return row.requesterId === viewerId ? "outgoing_pending" : "incoming_pending";
}

export async function connectionState(
  db: D1Database,
  viewerId: string,
  otherUserId: string,
): Promise<ConnectionState> {
  const row = await db
    .prepare(
      `SELECT requester_id AS requesterId, status
       FROM connections
       WHERE (requester_id = ? AND recipient_id = ?)
          OR (requester_id = ? AND recipient_id = ?)
       ORDER BY CASE status
         WHEN 'blocked' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END
       LIMIT 1`,
    )
    .bind(viewerId, otherUserId, otherUserId, viewerId)
    .first<{ requesterId: string; status: string }>();
  return connectionStateFromRow(row, viewerId);
}

export async function sendConnectionRequest(
  db: D1Database,
  user: SessionUser,
  recipientId: string,
) {
  if (recipientId === user.id)
    throw new Response("You cannot connect with yourself.", { status: 400 });
  if ((await connectionState(db, user.id, recipientId)) !== "none")
    throw new Response("A connection relationship already exists.", {
      status: 409,
    });
  const connectionId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `DELETE FROM connections
         WHERE status = 'declined'
           AND ((requester_id = ? AND recipient_id = ?)
             OR (requester_id = ? AND recipient_id = ?))`,
      )
      .bind(user.id, recipientId, recipientId, user.id),
    db
      .prepare(
        `INSERT INTO connections
         (id, requester_id, recipient_id, status)
         VALUES (?, ?, ?, 'pending')`,
      )
      .bind(connectionId, user.id, recipientId),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'connection.requested', 'New connection request',
                 ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        recipientId,
        `${user.displayName} would like to connect.`,
        `/profiles/${user.username}`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'connection.requested', 'connection', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, connectionId),
  ]);
}

export async function acceptConnectionRequest(
  db: D1Database,
  user: SessionUser,
  requesterId: string,
) {
  const connection = await db
    .prepare(
      `SELECT id FROM connections
       WHERE requester_id = ? AND recipient_id = ? AND status = 'pending'`,
    )
    .bind(requesterId, user.id)
    .first<{ id: string }>();
  if (!connection)
    throw new Response("Pending request not found.", { status: 404 });
  await db.batch([
    db
      .prepare(
        `UPDATE connections SET status = 'accepted',
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(connection.id),
    db
      .prepare(
        `INSERT INTO notifications
         (id, user_id, kind, title, body, action_url)
         VALUES (?, ?, 'connection.accepted', 'Connection accepted', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        requesterId,
        `${user.displayName} accepted your connection request.`,
        `/profiles/${user.username}`,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs
         (id, actor_user_id, action, subject_type, subject_id)
         VALUES (?, ?, 'connection.accepted', 'connection', ?)`,
      )
      .bind(crypto.randomUUID(), user.id, connection.id),
  ]);
}

export async function loadVisibleContacts(
  db: D1Database,
  ownerId: string,
  viewerId: string | null,
) {
  if (!viewerId) return [];
  const connected =
    ownerId === viewerId ||
    (await connectionState(db, viewerId, ownerId)) === "connected";
  if (!connected) return [];
  const rows = await db
    .prepare(
      `SELECT contact_type AS contactType, contact_value AS contactValue,
              verified_at AS verifiedAt
       FROM profile_contacts
       WHERE user_id = ? AND (
         ? = 1 OR visibility IN ('connections', 'connections_and_project_interests')
       )
       ORDER BY contact_type`,
    )
    .bind(ownerId, ownerId === viewerId ? 1 : 0)
    .all<{
      contactType: string;
      contactValue: string;
      verifiedAt: string | null;
    }>();
  return rows.results;
}
