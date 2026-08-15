import type { Route } from "./+types/activation-events";
import { recordActivationClick } from "~/lib/activation-analytics.server";
import type { ActivationAction } from "~/lib/activation-next-actions";
import { requireUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { assertSameOrigin } from "~/lib/security.server";

const allowedActionKeys = new Set([
  "applicant-profile",
  "applicant-projects",
  "applicant-events",
  "profile-readiness",
  "founder-first-project",
  "founder-project-claim",
  "founder-draft-project",
  "founder-project-needs",
  "creator-readiness",
  "creator-campaigns",
  "investor-preferences",
  "investor-verification",
  "investor-review-pending",
  "investor-opportunities",
  "pending-connections",
  "unread-notifications",
  "discover-members",
]);

type AllowedRole = NonNullable<ActivationAction["role"]> | "";

const allowedRoles = new Set<AllowedRole>([
  "account",
  "network",
  "founder",
  "creator",
  "investor",
  "",
]);

function isAllowedRole(value: string): value is AllowedRole {
  return allowedRoles.has(value as AllowedRole);
}

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  const db = context.get(cloudflareContext).env.DB;
  const user = await requireUser(request, db);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid activation event." },
      { status: 400 },
    );
  }

  if (!payload || typeof payload !== "object") {
    return Response.json(
      { error: "Invalid activation event." },
      { status: 400 },
    );
  }

  const candidate = payload as Record<string, unknown>;
  const key = typeof candidate.key === "string" ? candidate.key : "";
  const role = typeof candidate.role === "string" ? candidate.role : "";
  const to = typeof candidate.to === "string" ? candidate.to : "";

  if (
    !allowedActionKeys.has(key) ||
    !isAllowedRole(role) ||
    !to.startsWith("/") ||
    to.startsWith("//") ||
    to.length > 240
  ) {
    return Response.json(
      { error: "Invalid activation event." },
      { status: 400 },
    );
  }

  await recordActivationClick(db, user.id, {
    key,
    role: role === "" ? undefined : role,
    to,
  });

  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
