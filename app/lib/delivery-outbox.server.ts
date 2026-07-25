import {
  deliveryErrorCategory,
  deliveryFailureStatus,
  deliveryRetryDelaySeconds,
  sanitizeDeliveryError,
} from "./delivery-policy";
import { ensureDeliveryOperationsSchema } from "./delivery-operations-schema.server";

export type DeliveryChannel = "email" | "telegram" | "export";
export type DeliveryStatus =
  | "queued"
  | "processing"
  | "delivered"
  | "failed"
  | "dead_letter"
  | "cancelled";

export type EmailDeliveryPayload = {
  recipient: string;
  subject: string;
  html: string;
  text: string;
};

type DeliveryEnvironment = CloudflareEnvironment & {
  RESEND_API_KEY?: string;
  MEMBERSHIP_FROM_EMAIL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  APP_URL?: string;
};

type DeliveryRow = {
  id: string;
  channel: DeliveryChannel;
  messageType: string;
  recipientReference: string;
  payloadReference: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
};

type DeliveryProviderResult = { providerResponseId?: string };

async function existingDelivery(db: D1Database, idempotencyKey: string) {
  return db
    .prepare(
      `SELECT id, status FROM delivery_outbox WHERE idempotency_key = ?`,
    )
    .bind(idempotencyKey)
    .first<{ id: string; status: DeliveryStatus }>();
}

export async function enqueueEmailDelivery(
  env: DeliveryEnvironment,
  input: {
    messageType: string;
    recipientReference: string;
    idempotencyKey: string;
    payload: EmailDeliveryPayload;
    createdBy?: string | null;
  },
) {
  await ensureDeliveryOperationsSchema(env.DB);
  const existing = await existingDelivery(env.DB, input.idempotencyKey);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const payloadReference = `delivery-payloads/${id}.json`;
  await env.MEDIA.put(payloadReference, JSON.stringify(input.payload), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { purpose: "delivery-outbox", messageType: input.messageType },
  });

  try {
    const result = await env.DB.prepare(
      `INSERT INTO delivery_outbox
       (id, channel, message_type, recipient_reference, idempotency_key,
        payload_reference, status, created_by)
       VALUES (?, 'email', ?, ?, ?, ?, 'queued', ?) 
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
      .bind(
        id,
        input.messageType.slice(0, 100),
        input.recipientReference.slice(0, 160),
        input.idempotencyKey.slice(0, 240),
        payloadReference,
        input.createdBy ?? null,
      )
      .run();
    if ((result.meta.changes ?? 0) === 1)
      return { id, status: "queued" as const };
  } catch (error) {
    await env.MEDIA.delete(payloadReference);
    throw error;
  }

  await env.MEDIA.delete(payloadReference);
  const duplicate = await existingDelivery(env.DB, input.idempotencyKey);
  if (!duplicate) throw new Error("Delivery could not be queued.");
  return duplicate;
}

export async function enqueueReferenceDelivery(
  db: D1Database,
  input: {
    channel: Exclude<DeliveryChannel, "email">;
    messageType: string;
    recipientReference: string;
    idempotencyKey: string;
    payloadReference: string;
    createdBy?: string | null;
  },
) {
  await ensureDeliveryOperationsSchema(db);
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO delivery_outbox
       (id, channel, message_type, recipient_reference, idempotency_key,
        payload_reference, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      id,
      input.channel,
      input.messageType.slice(0, 100),
      input.recipientReference.slice(0, 160),
      input.idempotencyKey.slice(0, 240),
      input.payloadReference.slice(0, 500),
      input.createdBy ?? null,
    )
    .run();
  return existingDelivery(db, input.idempotencyKey);
}

async function claimDelivery(db: D1Database, id: string) {
  const claimed = await db
    .prepare(
      `UPDATE delivery_outbox
       SET status = 'processing', attempt_count = attempt_count + 1,
           attempted_at = datetime('now'), claimed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND (
         (status IN ('queued','failed') AND next_attempt_at <= datetime('now'))
         OR (status = 'processing' AND claimed_at <= datetime('now', '-15 minutes'))
       )`,
    )
    .bind(id)
    .run();
  if ((claimed.meta.changes ?? 0) !== 1) return null;
  return db
    .prepare(
      `SELECT id, channel, message_type AS messageType,
              recipient_reference AS recipientReference,
              payload_reference AS payloadReference, status,
              attempt_count AS attemptCount, max_attempts AS maxAttempts
       FROM delivery_outbox WHERE id = ?`,
    )
    .bind(id)
    .first<DeliveryRow>();
}

async function deliverEmail(
  env: DeliveryEnvironment,
  item: DeliveryRow,
): Promise<DeliveryProviderResult> {
  if (!env.RESEND_API_KEY || !env.MEMBERSHIP_FROM_EMAIL)
    throw new Error("Transactional email is not configured.");
  if (!item.payloadReference) throw new Error("Email payload reference missing.");
  const object = await env.MEDIA.get(item.payloadReference);
  if (!object) throw new Error("Email payload is unavailable.");
  const payload = await object.json<EmailDeliveryPayload>();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MEMBERSHIP_FROM_EMAIL,
      to: [payload.recipient],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  const result = await response.json<{ id?: string }>();
  return { providerResponseId: result.id };
}

async function deliverTelegram(
  env: DeliveryEnvironment,
  item: DeliveryRow,
): Promise<DeliveryProviderResult> {
  if (!env.TELEGRAM_BOT_TOKEN)
    throw new Error("Telegram delivery is not configured.");
  if (!item.payloadReference)
    throw new Error("Telegram notification reference missing.");
  const notification = await env.DB.prepare(
    `SELECT n.title, n.body, n.action_url AS actionUrl,
            ta.chat_id AS chatId
     FROM notifications n
     JOIN telegram_accounts ta ON ta.user_id = n.user_id
       AND ta.status = 'linked'
     WHERE n.id = ?`,
  )
    .bind(item.payloadReference)
    .first<{
      title: string;
      body: string;
      actionUrl: string;
      chatId: string;
    }>();
  if (!notification) throw new Error("Telegram recipient has no linked account.");
  const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: notification.chatId,
      text: `${notification.title}\n\n${notification.body}${
        notification.actionUrl && env.APP_URL
          ? `\n\n${env.APP_URL}${notification.actionUrl}`
          : ""
      }`,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  const result = await response.json<{ result?: { message_id?: number } }>();
  return {
    providerResponseId: result.result?.message_id
      ? String(result.result.message_id)
      : undefined,
  };
}

async function markDelivered(
  env: DeliveryEnvironment,
  item: DeliveryRow,
  result: DeliveryProviderResult,
) {
  await env.DB.prepare(
    `UPDATE delivery_outbox
     SET status = 'delivered', provider_response_id = ?,
         error_category = NULL, last_error = NULL,
         delivered_at = datetime('now'), claimed_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND status = 'processing'`,
  )
    .bind(result.providerResponseId ?? null, item.id)
    .run();
  if (item.channel === "email" && item.payloadReference)
    await env.MEDIA.delete(item.payloadReference);
}

async function markFailed(
  db: D1Database,
  item: DeliveryRow,
  error: unknown,
) {
  const status = deliveryFailureStatus(item.attemptCount, item.maxAttempts);
  const retrySeconds = deliveryRetryDelaySeconds(item.attemptCount);
  await db
    .prepare(
      `UPDATE delivery_outbox
       SET status = ?, error_category = ?, last_error = ?,
           next_attempt_at = datetime('now', ?), claimed_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND status = 'processing'`,
    )
    .bind(
      status,
      deliveryErrorCategory(error),
      sanitizeDeliveryError(error),
      `+${retrySeconds} seconds`,
      item.id,
    )
    .run();
}

async function deliverItem(env: DeliveryEnvironment, item: DeliveryRow) {
  try {
    const result =
      item.channel === "email"
        ? await deliverEmail(env, item)
        : item.channel === "telegram"
          ? await deliverTelegram(env, item)
          : (() => {
              throw new Error("Export delivery requires an explicit operator action.");
            })();
    await markDelivered(env, item, result);
  } catch (error) {
    await markFailed(env.DB, item, error);
  }
}

export async function processDeliveryOutbox(
  env: DeliveryEnvironment,
  options: { limit?: number; onlyId?: string } = {},
) {
  await ensureDeliveryOperationsSchema(env.DB);
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const candidates = options.onlyId
    ? [{ id: options.onlyId }]
    : (
        await env.DB.prepare(
          `SELECT id FROM delivery_outbox
           WHERE (status IN ('queued','failed') AND next_attempt_at <= datetime('now'))
              OR (status = 'processing' AND claimed_at <= datetime('now', '-15 minutes'))
           ORDER BY next_attempt_at, created_at LIMIT ?`,
        )
          .bind(limit)
          .all<{ id: string }>()
      ).results;
  let processed = 0;
  for (const candidate of candidates) {
    const claimed = await claimDelivery(env.DB, candidate.id);
    if (!claimed) continue;
    await deliverItem(env, claimed);
    processed += 1;
  }
  return processed;
}

export async function deliveryStatus(db: D1Database, id: string) {
  return db
    .prepare(`SELECT status FROM delivery_outbox WHERE id = ?`)
    .bind(id)
    .first<{ status: DeliveryStatus }>();
}

export async function retryDelivery(
  db: D1Database,
  deliveryId: string,
  actorUserId: string,
) {
  await ensureDeliveryOperationsSchema(db);
  const changed = await db
    .prepare(
      `UPDATE delivery_outbox
       SET status = 'queued', attempt_count = 0, next_attempt_at = datetime('now'),
           claimed_at = NULL, error_category = NULL, last_error = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND status IN ('failed','dead_letter')`,
    )
    .bind(deliveryId)
    .run();
  if ((changed.meta.changes ?? 0) !== 1) return false;
  await db
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id)
       VALUES (?, ?, 'delivery.retried', 'delivery_outbox', ?)`,
    )
    .bind(crypto.randomUUID(), actorUserId, deliveryId)
    .run();
  return true;
}

export async function cancelDelivery(
  db: D1Database,
  deliveryId: string,
  actorUserId: string,
) {
  await ensureDeliveryOperationsSchema(db);
  const changed = await db
    .prepare(
      `UPDATE delivery_outbox
       SET status = 'cancelled', claimed_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND status IN ('queued','failed','dead_letter')`,
    )
    .bind(deliveryId)
    .run();
  if ((changed.meta.changes ?? 0) !== 1) return false;
  await db
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_user_id, action, subject_type, subject_id)
       VALUES (?, ?, 'delivery.cancelled', 'delivery_outbox', ?)`,
    )
    .bind(crypto.randomUUID(), actorUserId, deliveryId)
    .run();
  return true;
}
