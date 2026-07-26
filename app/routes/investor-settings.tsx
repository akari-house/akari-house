import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/investor-settings";
import { SiteHeader } from "~/components/SiteHeader";
import { requireApprovedMember } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import {
  investorProfileStatuses,
  recordOpportunityAudit,
  type InvestorProfileStatus,
} from "~/lib/opportunity-access.server";
import { requireActionRateLimit } from "~/lib/rate-limit.server";
import { assertSameOrigin } from "~/lib/security.server";
import { formText } from "~/lib/validation";

type InvestorProfileRow = {
  status: InvestorProfileStatus;
  sectorsJson: string;
  stagesJson: string;
  geographiesJson: string;
  minimumTicket: number | null;
  maximumTicket: number | null;
  ticketCurrency: string;
  eligibilityNote: string;
  decisionNote: string;
};

function listValue(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

function optionalAmount(value: FormDataEntryValue | null) {
  const text = formText(value).trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : Number.NaN;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("investor"))
    throw new Response("Investor role required.", { status: 403 });
  await db
    .prepare(
      `INSERT OR IGNORE INTO investor_profiles (user_id, status)
       VALUES (?, 'claimed')`,
    )
    .bind(user.id)
    .run();
  const profile = await db
    .prepare(
      `SELECT status, sectors_json AS sectorsJson, stages_json AS stagesJson,
              geographies_json AS geographiesJson,
              minimum_ticket AS minimumTicket,
              maximum_ticket AS maximumTicket,
              ticket_currency AS ticketCurrency,
              eligibility_note AS eligibilityNote,
              decision_note AS decisionNote
       FROM investor_profiles WHERE user_id = ?`,
    )
    .bind(user.id)
    .first<InvestorProfileRow>();
  if (!profile)
    throw new Response("Investor profile unavailable.", { status: 500 });
  return {
    user,
    profile,
    sectors: JSON.parse(profile.sectorsJson) as string[],
    stages: JSON.parse(profile.stagesJson) as string[],
    geographies: JSON.parse(profile.geographiesJson) as string[],
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireApprovedMember(request, db);
  if (!user.roles.includes("investor"))
    throw new Response("Investor role required.", { status: 403 });
  await requireActionRateLimit(
    db,
    request,
    "investor-profile",
    user.id,
    15,
    60,
  );
  const current = await db
    .prepare("SELECT status FROM investor_profiles WHERE user_id = ?")
    .bind(user.id)
    .first<{ status: InvestorProfileStatus }>();
  const form = await request.formData();
  const intent = formText(form.get("intent"));
  if (!new Set(["save-profile", "submit-verification"]).has(intent))
    throw new Response("Unsupported action.", { status: 400 });
  const sectors = listValue(formText(form.get("sectors")));
  const stages = listValue(formText(form.get("stages")));
  const geographies = listValue(formText(form.get("geographies")));
  const minimumTicket = optionalAmount(form.get("minimumTicket"));
  const maximumTicket = optionalAmount(form.get("maximumTicket"));
  const ticketCurrency = formText(form.get("ticketCurrency"))
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const eligibilityNote = formText(form.get("eligibilityNote")).trim();

  if (!sectors.length || !stages.length || !geographies.length)
    return {
      error: "Add at least one sector, stage and geography preference.",
    };
  if (
    ![minimumTicket, maximumTicket].every(
      (value) => value === null || Number.isFinite(value),
    )
  )
    return {
      error:
        "Ticket amounts must be whole numbers greater than or equal to zero.",
    };
  if (
    minimumTicket !== null &&
    maximumTicket !== null &&
    minimumTicket > maximumTicket
  )
    return { error: "The minimum ticket cannot exceed the maximum ticket." };
  if (!/^[A-Z]{3}$/.test(ticketCurrency))
    return { error: "Use a three-letter currency code." };
  if (eligibilityNote.length < 20 || eligibilityNote.length > 1200)
    return {
      error:
        "Add an eligibility and experience note between 20 and 1,200 characters.",
    };

  const protectedStatus = current?.status
    ? new Set<InvestorProfileStatus>([
        "verified",
        "restricted",
        "rejected",
      ]).has(current.status)
    : false;
  const nextStatus: InvestorProfileStatus = protectedStatus
    ? current!.status
    : intent === "submit-verification"
      ? "verification_pending"
      : "profile_complete";
  if (!investorProfileStatuses.includes(nextStatus))
    throw new Response("Invalid Investor state.", { status: 400 });

  const statements = [
    db
      .prepare(
        `INSERT INTO investor_profiles
           (user_id, status, sectors_json, stages_json, geographies_json,
            minimum_ticket, maximum_ticket, ticket_currency,
            eligibility_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           status = excluded.status,
           sectors_json = excluded.sectors_json,
           stages_json = excluded.stages_json,
           geographies_json = excluded.geographies_json,
           minimum_ticket = excluded.minimum_ticket,
           maximum_ticket = excluded.maximum_ticket,
           ticket_currency = excluded.ticket_currency,
           eligibility_note = excluded.eligibility_note,
           updated_at = datetime('now')`,
      )
      .bind(
        user.id,
        nextStatus,
        JSON.stringify(sectors),
        JSON.stringify(stages),
        JSON.stringify(geographies),
        minimumTicket,
        maximumTicket,
        ticketCurrency,
        eligibilityNote,
      ),
  ];
  if (intent === "submit-verification" && !protectedStatus)
    statements.push(
      db
        .prepare(
          `INSERT INTO role_verifications (user_id, role, status, updated_at)
           VALUES (?, 'investor', 'pending', datetime('now'))
           ON CONFLICT(user_id, role) DO UPDATE SET
             status = 'pending', reviewed_by = NULL, reviewed_at = NULL,
             decision_note = '', updated_at = datetime('now')`,
        )
        .bind(user.id),
    );
  await db.batch(statements);
  await recordOpportunityAudit(
    db,
    user.id,
    intent === "submit-verification"
      ? "investor.verification_submitted"
      : "investor.profile_updated",
    user.id,
  );
  throw redirect(`/settings/investor?saved=${nextStatus}`);
}

export default function InvestorSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const profile = loaderData.profile;
  const reviewLocked = new Set(["verification_pending", "verified"]).has(
    profile.status,
  );
  return (
    <div className="dashboard-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="admin-main investor-settings-main">
        <header className="admin-heading">
          <div>
            <span className="eyebrow">Investor profile</span>
            <h1>Set your opportunity preferences.</h1>
            <p>
              Selecting the Investor role is a claim, not verification. Private
              rooms stay closed until AKARI completes its review.
            </p>
          </div>
          <Link className="button button-quiet" to="/deals">
            Browse approved previews
          </Link>
        </header>

        <p className="notice applicant-notice">
          Current state: <strong>{profile.status.replaceAll("_", " ")}</strong>
          {profile.decisionNote ? ` · ${profile.decisionNote}` : ""}
        </p>
        {actionData?.error && (
          <p className="form-error" role="alert">
            {actionData.error}
          </p>
        )}

        <Form method="post" className="form-stack investor-preference-form">
          <div className="form-grid">
            <label>
              Sectors
              <input
                name="sectors"
                defaultValue={loaderData.sectors.join(", ")}
                placeholder="Infrastructure, AI, gaming"
                required
              />
              <small>Separate multiple preferences with commas.</small>
            </label>
            <label>
              Stages
              <input
                name="stages"
                defaultValue={loaderData.stages.join(", ")}
                placeholder="Prototype, early revenue"
                required
              />
            </label>
            <label>
              Geographies
              <input
                name="geographies"
                defaultValue={loaderData.geographies.join(", ")}
                placeholder="Europe, GCC, Southeast Asia"
                required
              />
            </label>
            <label>
              Ticket currency
              <input
                name="ticketCurrency"
                defaultValue={profile.ticketCurrency}
                minLength={3}
                maxLength={3}
                required
              />
            </label>
            <label>
              Minimum ticket
              <input
                type="number"
                min="0"
                step="1"
                name="minimumTicket"
                defaultValue={profile.minimumTicket ?? ""}
              />
            </label>
            <label>
              Maximum ticket
              <input
                type="number"
                min="0"
                step="1"
                name="maximumTicket"
                defaultValue={profile.maximumTicket ?? ""}
              />
            </label>
          </div>
          <label>
            Eligibility and investment experience note
            <textarea
              name="eligibilityNote"
              minLength={20}
              maxLength={1200}
              rows={6}
              defaultValue={profile.eligibilityNote}
              required
            />
          </label>
          <div className="deal-action-row">
            <button
              className="button button-quiet"
              name="intent"
              value="save-profile"
            >
              Save preferences
            </button>
            {!new Set(["verified", "restricted", "rejected"]).has(
              profile.status,
            ) && (
              <button
                className="button button-primary"
                name="intent"
                value="submit-verification"
                disabled={reviewLocked}
              >
                {profile.status === "verification_pending"
                  ? "Verification pending"
                  : "Submit for verification"}
              </button>
            )}
          </div>
        </Form>
      </main>
    </div>
  );
}
