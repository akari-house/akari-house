import type { Route } from "./+types/hall";
import { HouseHall } from "~/components/house/HouseHall";
import { PetalField } from "~/components/house/PetalField";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export const meta: Route.MetaFunction = () => [
  { title: "The Hall | AKARI House" },
  {
    name: "description",
    content:
      "Choose the Strategy Room, Creator Studio or Investor Lounge inside AKARI House.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}

export default function Hall({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell standalone-house-page">
      <SiteHeader user={loaderData.user} />
      <PetalField />
      <main id="main-content">
        <HouseHall />
      </main>
    </div>
  );
}
