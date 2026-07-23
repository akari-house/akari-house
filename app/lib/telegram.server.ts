export interface TelegramEnvironment {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export async function deliverTelegramNotifications(
  env: CloudflareEnvironment & TelegramEnvironment,
) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const candidates = await env.DB.prepare(
    `SELECT n.id AS notificationId, n.title, n.body,
            n.action_url AS actionUrl, ta.chat_id AS chatId
     FROM notifications n
     JOIN telegram_accounts ta ON ta.user_id = n.user_id
       AND ta.status = 'linked'
     LEFT JOIN notification_deliveries nd
       ON nd.notification_id = n.id AND nd.channel = 'telegram'
     WHERE nd.id IS NULL OR nd.status IN ('pending', 'failed')
     ORDER BY n.created_at LIMIT 50`,
  ).all<{
    notificationId: string;
    title: string;
    body: string;
    actionUrl: string;
    chatId: string;
  }>();

  for (const item of candidates.results) {
    const deliveryId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO notification_deliveries
       (id, notification_id, channel, status, attempt_count)
       VALUES (?, ?, 'telegram', 'pending', 0)
       ON CONFLICT(notification_id, channel) DO NOTHING`,
    )
      .bind(deliveryId, item.notificationId)
      .run();
    const claimed = await env.DB.prepare(
      `UPDATE notification_deliveries
       SET status = 'processing', attempt_count = attempt_count + 1,
           updated_at = datetime('now')
       WHERE notification_id = ? AND channel = 'telegram'
         AND status IN ('pending', 'failed')`,
    )
      .bind(item.notificationId)
      .run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;
    try {
      const endpoint = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: item.chatId,
          text: `${item.title}\n\n${item.body}${
            item.actionUrl ? `\n\n${env.APP_URL}${item.actionUrl}` : ""
          }`,
          disable_web_page_preview: true,
        }),
      });
      if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
      await env.DB.prepare(
        `UPDATE notification_deliveries SET status = 'sent',
         delivered_at = datetime('now'), last_error = '',
         updated_at = datetime('now')
         WHERE notification_id = ? AND channel = 'telegram'`,
      )
        .bind(item.notificationId)
        .run();
    } catch (error) {
      await env.DB.prepare(
        `UPDATE notification_deliveries SET status = 'failed',
         last_error = ?, updated_at = datetime('now')
         WHERE notification_id = ? AND channel = 'telegram'`,
      )
        .bind(
          error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
          item.notificationId,
        )
        .run();
    }
  }
}
