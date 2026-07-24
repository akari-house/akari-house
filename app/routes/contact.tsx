import { Form } from "react-router";
import type { Route } from "./+types/contact";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { TurnstileWidget } from "~/components/TurnstileWidget";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { consumeAuthLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { verifyTurnstile } from "~/lib/turnstile.server";
import { formText } from "~/lib/validation";

const topics = [
  ["membership", "Membership"],
  ["campaigns", "Campaigns"],
  ["partnerships", "Partnerships"],
  ["privacy", "Privacy or data request"],
  ["support", "Account support"],
  ["other", "Other"],
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  return {
    user: await getOptionalUser(request, env.DB),
    siteKey: env.TURNSTILE_SITE_KEY,
    submitted: new URL(request.url).searchParams.has("submitted"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const { env } = context.get(cloudflareContext);
  const user = await getOptionalUser(request, env.DB);
  const form = await request.formData();
  if (!(await verifyTurnstile(request, form, env, "contact")))
    return { error: "Please complete the security check and try again." };
  const name = formText(form.get("name")).trim();
  const email = formText(form.get("email")).trim().toLowerCase();
  const topic = formText(form.get("topic"));
  const message = formText(form.get("message")).trim();
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !topics.some(([value]) => value === topic) ||
    message.length < 20 ||
    message.length > 3000
  )
    return { error: "Check your contact details and message." };
  const allowed = await consumeAuthLimit(
    env.DB,
    request,
    "contact",
    email,
    3,
    1440,
  );
  if (!allowed)
    throw new Response("Too many contact requests. Please try again later.", {
      status: 429,
      headers: { "Retry-After": "86400" },
    });
  await env.DB.prepare(
    `INSERT INTO contact_messages
     (id, user_id, name, email, topic, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), user?.id ?? null, name, email, topic, message)
    .run();
  return { submitted: true };
}

export default function Contact({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const submitted = loaderData.submitted || actionData?.submitted;
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">AKARI contact desk</span>
        <h1>How can we help?</h1>
        <p>
          Send a private message to the AKARI team. Privacy and account requests
          are reviewed through the same protected desk.
        </p>
        {submitted ? (
          <section className="status-card">
            <h2>Your message has reached AKARI.</h2>
            <p>The team will review it through the private admin desk.</p>
          </section>
        ) : (
          <Form method="post" className="profile-form">
            {actionData?.error && (
              <p className="form-error" role="alert">
                {actionData.error}
              </p>
            )}
            <label>
              Name
              <input
                name="name"
                minLength={2}
                maxLength={100}
                defaultValue={loaderData.user?.displayName}
                required
              />
            </label>
            <label>
              Reply email
              <input name="email" type="email" maxLength={254} required />
            </label>
            <label>
              Topic
              <select name="topic" defaultValue="support" required>
                {topics.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Message
              <textarea
                name="message"
                rows={8}
                minLength={20}
                maxLength={3000}
                required
              />
            </label>
            <TurnstileWidget siteKey={loaderData.siteKey} action="contact" />
            <button className="button button-primary">Send to AKARI</button>
          </Form>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
