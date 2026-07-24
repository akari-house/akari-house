import { Form } from "react-router";
import type { Route } from "./+types/telegram-settings";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin, sha256 } from "~/lib/security.server";
import type { TelegramEnvironment } from "~/lib/telegram.server";
import { formText } from "~/lib/validation";
import { requireActionRateLimit } from "~/lib/rate-limit.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    TelegramEnvironment;
  const user = await requireApprovedMember(request, env.DB);
  const account = await env.DB.prepare(
    `SELECT telegram_username AS telegramUsername, status, linked_at AS linkedAt
     FROM telegram_accounts WHERE user_id = ?`,
  )
    .bind(user.id)
    .first<{
      telegramUsername: string;
      status: string;
      linkedAt: string | null;
    }>();
  return {
    user,
    account,
    botAvailable: Boolean(env.TELEGRAM_BOT_USERNAME && env.TELEGRAM_BOT_TOKEN),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const env = context.get(cloudflareContext).env as CloudflareEnvironment &
    TelegramEnvironment;
  const user = await requireApprovedMember(request, env.DB);
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (intent === "unlink") {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE telegram_accounts SET status = 'revoked',
           chat_id = NULL, updated_at = datetime('now') WHERE user_id = ?`,
      ).bind(user.id),
      env.DB.prepare(
        "DELETE FROM telegram_link_tokens WHERE user_id = ? AND consumed_at IS NULL",
      ).bind(user.id),
    ]);
    return { unlinked: true };
  }
  if (
    intent !== "link" ||
    !env.TELEGRAM_BOT_USERNAME ||
    !env.TELEGRAM_BOT_TOKEN
  )
    return { error: "Telegram linking is not configured yet." };
  await requireActionRateLimit(
    env.DB,
    request,
    "telegram-link",
    user.id,
    10,
    60,
  );
  const token = crypto.randomUUID().replaceAll("-", "");
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM telegram_link_tokens WHERE user_id = ? AND consumed_at IS NULL",
    ).bind(user.id),
    env.DB.prepare(
      `INSERT INTO telegram_link_tokens
         (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, datetime('now', '+15 minutes'))`,
    ).bind(crypto.randomUUID(), user.id, await sha256(token)),
    env.DB.prepare(
      `INSERT INTO telegram_accounts (user_id, status, updated_at)
         VALUES (?, 'pending', datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET status = 'pending',
           updated_at = excluded.updated_at`,
    ).bind(user.id),
  ]);
  return {
    deepLink: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=akari_${token}`,
  };
}

export default function TelegramSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Notification channels</span>
        <h1>Connect Telegram securely.</h1>
        <p>
          A typed handle is not verification. Linking is completed only when
          your Telegram account opens the AKARI bot using a short-lived token.
        </p>
        {loaderData.account?.status === "linked" && (
          <div className="status-card success">
            <h2>Telegram linked</h2>
            <p>@{loaderData.account.telegramUsername || "connected account"}</p>
            <Form method="post">
              <button
                className="button button-quiet"
                name="intent"
                value="unlink"
              >
                Disconnect Telegram
              </button>
            </Form>
          </div>
        )}
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}
        {actionData?.deepLink && (
          <div className="status-card success">
            <h2>Your secure link is ready for 15 minutes</h2>
            <a
              className="button button-primary"
              href={actionData.deepLink}
              rel="noreferrer"
              target="_blank"
            >
              Open AKARI bot in Telegram
            </a>
          </div>
        )}
        {loaderData.account?.status !== "linked" && (
          <Form method="post">
            <button
              className="button button-primary"
              name="intent"
              value="link"
              disabled={!loaderData.botAvailable}
            >
              {loaderData.botAvailable
                ? "Create Telegram link"
                : "Telegram bot configuration pending"}
            </button>
          </Form>
        )}
      </main>
    </div>
  );
}
