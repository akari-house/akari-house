import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/report";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";
import { requireActionRateLimit } from "~/lib/rate-limit.server";

function reportTarget(request: Request) {
  const url = new URL(request.url);
  const requestedReturn = url.searchParams.get("returnTo") ?? "/";
  return {
    subjectType: url.searchParams.get("subjectType") ?? "",
    subjectId: url.searchParams.get("subjectId") ?? "",
    returnTo:
      requestedReturn.startsWith("/") && !requestedReturn.startsWith("//")
        ? requestedReturn
        : "/",
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireApprovedMember(
    request,
    context.get(cloudflareContext).env.DB,
  );
  const target = reportTarget(request);
  if (
    !["profile", "project", "event"].includes(target.subjectType) ||
    !target.subjectId
  )
    throw new Response("Invalid report target.", { status: 400 });
  return { user, ...target };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  await requireActionRateLimit(db, request, "reports", user.id, 5, 1440);
  const form = await request.formData();
  const subjectType = formText(form.get("subjectType"));
  const subjectId = formText(form.get("subjectId"));
  const reason = formText(form.get("reason"));
  const details = formText(form.get("details")).trim();
  const returnTo = formText(form.get("returnTo"));
  if (
    !["profile", "project", "event"].includes(subjectType) ||
    !["spam", "harassment", "misrepresentation", "unsafe", "other"].includes(
      reason,
    ) ||
    details.length > 1500
  )
    return { error: "Check the report fields." };
  const subjectExists =
    subjectType === "profile"
      ? await db
          .prepare("SELECT 1 FROM profiles WHERE user_id = ?")
          .bind(subjectId)
          .first()
      : subjectType === "project"
        ? await db
            .prepare("SELECT 1 FROM projects WHERE id = ?")
            .bind(subjectId)
            .first()
        : await db
            .prepare("SELECT 1 FROM events WHERE id = ?")
            .bind(subjectId)
            .first();
  if (!subjectExists)
    throw new Response("Report target not found.", { status: 404 });
  const existing = await db
    .prepare(
      `SELECT 1 FROM moderation_reports
       WHERE reporter_user_id = ? AND subject_type = ? AND subject_id = ?
         AND status IN ('open', 'reviewing')`,
    )
    .bind(user.id, subjectType, subjectId)
    .first();
  if (existing)
    return { error: "You already have an open report for this item." };
  await db
    .prepare(
      `INSERT INTO moderation_reports
       (id, reporter_user_id, subject_type, subject_id, reason, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), user.id, subjectType, subjectId, reason, details)
    .run();
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  throw redirect(
    `${safeReturn}${safeReturn.includes("?") ? "&" : "?"}reported=1`,
  );
}

export default function Report({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="editor-main">
        <span className="eyebrow">Trust and safety</span>
        <h1>Report a concern.</h1>
        <p>
          Reports are private and reviewed by the AKARI team. Do not use this
          form for emergencies.
        </p>
        <Form method="post" className="profile-form">
          {actionData?.error && (
            <p className="form-error" role="alert">
              {actionData.error}
            </p>
          )}
          <input
            type="hidden"
            name="subjectType"
            value={loaderData.subjectType}
          />
          <input type="hidden" name="subjectId" value={loaderData.subjectId} />
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <label>
            Reason
            <select name="reason" required>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="misrepresentation">Misrepresentation</option>
              <option value="unsafe">Unsafe content or behaviour</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            What should the team know?
            <textarea name="details" rows={6} maxLength={1500} />
          </label>
          <div className="form-row">
            <button className="button button-primary">Submit report</button>
            <Link className="button button-quiet" to={loaderData.returnTo}>
              Cancel
            </Link>
          </div>
        </Form>
      </main>
    </div>
  );
}
