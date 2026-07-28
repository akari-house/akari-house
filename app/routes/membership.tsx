import type { Route } from "./+types/membership";
import { MembershipDesk } from "~/components/membership/MembershipDesk";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export const meta: Route.MetaFunction = () => [
  { title: "Membership | AKARI House" },
  {
    name: "description",
    content:
      "Choose how you participate in AKARI House as a Founder, Creator or Investor.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}

export default function Membership({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="standalone-membership">
        <MembershipDesk standalone />
      </main>
      <PublicFooter />
    </div>
  );
}
