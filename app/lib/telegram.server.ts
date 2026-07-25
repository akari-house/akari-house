import {
  enqueueReferenceDelivery,
  processDeliveryOutbox,
} from "./delivery-outbox.server";
import { ensureDeliveryOperationsSchema } from "./delivery-operations-schema.server";

export interface TelegramEnvironment {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export async function deliverTelegramNotifications(
  env: CloudflareEnvironment & TelegramEnvironment,
) {
  await ensureDeliveryOperationsSchema(env.DB);
  const candidates = await env.DB.prepare(
    `SELECT n.id AS notificationId, n.user_id AS userId
     FROM notifications n
     JOIN telegram_accounts ta ON ta.user_id = n.user_id
       AND ta.status = 'linked'
     LEFT JOIN delivery_outbox delivery
       ON delivery.idempotency_key = ('telegram:' || n.id)
     WHERE delivery.id IS NULL
     ORDER BY n.created_at LIMIT 100`,
  ).all<{ notificationId: string; userId: string }>();

  for (const item of candidates.results) {
    await enqueueReferenceDelivery(env.DB, {
      channel: "telegram",
      messageType: "notification",
      recipientReference: item.userId,
      idempotencyKey: `telegram:${item.notificationId}`,
      payloadReference: item.notificationId,
    });
  }
  return processDeliveryOutbox(env, { limit: 100 });
}
