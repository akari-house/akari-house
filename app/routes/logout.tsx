import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { clearSessionCookie, destroySession } from "~/lib/auth.server";
import { assertSameOrigin } from "~/lib/security.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function action({ request, context }: Route.ActionArgs) {
  assertSameOrigin(request);
  await destroySession(request, context.get(cloudflareContext).env.DB);
  return redirect("/", { headers: { "Set-Cookie": clearSessionCookie(request) } });
}

export function loader() {
  throw new Response("Method not allowed", { status: 405 });
}
