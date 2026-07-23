import type { Route } from "./+types/telegram-webhook";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  safeEqualText,
  sha256,
} from "~/lib/security.server";
import type { TelegramEnvironment } from "~/lib/telegram.server";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; username?: string };
  };
};

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    TelegramEnvironment;
  if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_BOT_TOKEN)
    throw new Response("Not configured.", { status: 503 });
  const supplied =
    request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!safeEqualText(supplied, env.TELEGRAM_WEBHOOK_SECRET))
    throw new Response("Forbidden.", { status: 403 });
  if (Number(request.headers.get("Content-Length") ?? "0") > 65_536)
    throw new Response("Payload too large.", { status: 413 });
  const update: TelegramUpdate = await request.json();
  const match = update.message?.text?.match(/^\/start akari_([a-f0-9]{32})$/i);
  const telegramUserId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  if (!match || !telegramUserId || !chatId) return Response.json({ ok: true });
  const token = await env.DB.prepare(
    `SELECT id, user_id AS userId FROM telegram_link_tokens
     WHERE token_hash = ? AND consumed_at IS NULL
       AND expires_at > datetime('now')`,
  )
    .bind(await sha256(match[1]))
    .first<{ id: string; userId: string }>();
  if (!token) return Response.json({ ok: true });
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO telegram_accounts
         (user_id, telegram_user_id, telegram_username, chat_id, status,
          linked_at, updated_at)
         VALUES (?, ?, ?, ?, 'linked', datetime('now'), datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           telegram_user_id = excluded.telegram_user_id,
           telegram_username = excluded.telegram_username,
           chat_id = excluded.chat_id, status = 'linked',
           linked_at = excluded.linked_at, updated_at = excluded.updated_at`,
      )
      .bind(
        token.userId,
        String(telegramUserId),
        update.message?.from?.username ?? "",
        String(chatId),
      ),
    env.DB
      .prepare(
        "UPDATE telegram_link_tokens SET consumed_at = datetime('now') WHERE id = ?",
      )
      .bind(token.id),
  ]);
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "AKARI House is connected. You can now receive selected account notifications here.",
      }),
    },
  );
  return Response.json({ ok: true });
}
