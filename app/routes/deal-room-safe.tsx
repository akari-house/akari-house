import type { ComponentType } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/deal-room-safe";
import ExistingDealRoom, {
  action as existingDealRoomAction,
  loader as existingDealRoomLoader,
} from "./deal-room";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { isOpportunitySchemaUnavailable } from "~/lib/opportunity-schema.server";

type ExistingLoaderData = Awaited<ReturnType<typeof existingDealRoomLoader>>;
type ExistingDealRoomProps = { loaderData: ExistingLoaderData };

const ExistingDealRoomView =
  ExistingDealRoom as unknown as ComponentType<ExistingDealRoomProps>;

export const meta: Route.MetaFunction = () => [
  { title: "Selected opportunity | AKARI House" },
  {
    name: "description",
    content: "An approved opportunity preview inside AKARI House.",
  },
];

export async function loader(args: Route.LoaderArgs) {
  try {
    return {
      mode: "ready" as const,
      data: await existingDealRoomLoader(args as never),
    };
  } catch (error) {
    if (!isOpportunitySchemaUnavailable(error)) throw error;

    const slug = args.params.dealSlug ?? "";
    const db = args.context.get(cloudflareContext).env.DB;
    const project = await db
      .prepare(
        `SELECT slug FROM projects
         WHERE slug = ? AND status = 'published'
         LIMIT 1`,
      )
      .bind(slug)
      .first<{ slug: string }>();

    if (project) throw redirect(`/projects/${project.slug}`);
    throw new Response("Opportunity not found.", { status: 404 });
  }
}

export async function action(args: Route.ActionArgs) {
  try {
    return await existingDealRoomAction(args as never);
  } catch (error) {
    if (isOpportunitySchemaUnavailable(error))
      throw new Response("The private deal room is still being activated.", {
        status: 503,
      });
    throw error;
  }
}

export default function DealRoomSafe({ loaderData }: Route.ComponentProps) {
  return <ExistingDealRoomView loaderData={loaderData.data} />;
}
