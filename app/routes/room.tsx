import { Link } from "react-router";
import type { Route } from "./+types/room";
import { CommonTable } from "~/components/common-table/CommonTable";
import { PetalField } from "~/components/house/PetalField";
import { SceneMotion } from "~/components/house/SceneMotion";
import { SiteHeader } from "~/components/SiteHeader";
import { rooms } from "~/data/house";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: loaderData
        ? `${loaderData.room.title} — AKARI House`
        : "Room not found",
    },
    {
      name: "description",
      content: loaderData?.room.summary ?? "AKARI House",
    },
  ];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const room = rooms.find((entry) => entry.slug === params.room);
  if (!room) throw new Response("Room not found", { status: 404 });
  return {
    room,
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}

export default function Room({ loaderData }: Route.ComponentProps) {
  const { room, user } = loaderData;
  return (
    <div className="site-shell room-page">
      <SiteHeader user={user} />
      <PetalField />
      <SceneMotion />
      <main id="main-content">
        <section className="room-hero" aria-labelledby="room-title">
          <div
            className="room-hero-art"
            style={{ backgroundImage: `url(${room.image})` }}
            role="img"
            aria-label={`${room.title} inside the lantern-lit AKARI House.`}
          />
          <div className="room-hero-shade" />
          <div className="room-hero-copy">
            <span className="chapter">
              {room.number} · {room.audience}
            </span>
            <h1 id="room-title">{room.title}</h1>
            <p>{room.detail}</p>
            <div className="room-page-actions">
              <Link
                className="button button-primary"
                to={`/register?role=${room.role}`}
              >
                {room.action}
              </Link>
              <Link className="button button-quiet" to="/hall">
                Return to the Hall
              </Link>
            </div>
          </div>
        </section>

        <section
          className="room-page-content chapter-section"
          aria-label={`${room.title} capabilities`}
        >
          <div className="room-feature-grid">
            {room.features.map((feature) => (
              <article key={feature.title}>
                <strong>{feature.title}</strong>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
          <div className="room-workspace-preview">
            <span className="chapter">A place at the Common Table</span>
            <h2>Role-specific context. One shared network.</h2>
            <CommonTable compact />
          </div>
        </section>
      </main>
    </div>
  );
}
