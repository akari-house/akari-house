import { Link } from "react-router";
import type { Route } from "./+types/home";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export const meta: Route.MetaFunction = () => [
  { title: "AKARI House — Trusted Web3 relationships" },
  { name: "description", content: "A curated network for founders, creators and investors to build trusted relationships." },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  return { user: await getOptionalUser(request, context.get(cloudflareContext).env.DB) };
}

const rooms = [
  { number: "01", title: "Strategy Room", audience: "For founders", copy: "Shape GTM direction, surface immediate needs and find the right people to move with." },
  { number: "02", title: "Creator Studio", audience: "For creators", copy: "Present trusted expertise, relevant audiences and the work you want to be known for." },
  { number: "03", title: "Investor Lounge", audience: "For investors", copy: "Discover curated opportunities while keeping access and introductions considered." },
];

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <main>
        <section className="hero">
          <div className="petal petal-one" /><div className="petal petal-two" /><div className="petal petal-three" />
          <div className="hero-copy">
            <span className="eyebrow">A curated Web3 relationship &amp; GTM network</span>
            <h1>Where considered<br /><em>connections</em> begin.</h1>
            <p>AKARI House brings founders, creators and investors into one trusted space—built for relevant discovery, private connection and meaningful collaboration.</p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/register">Enter the House <span>→</span></Link>
              <a className="button button-quiet" href="#rooms">Explore the rooms</a>
            </div>
            <div className="trust-line"><span>Curated membership</span><span>Mutual connections</span><span>Privacy by design</span></div>
          </div>
          <div className="house-scene" aria-label="An abstract lantern-lit Japanese house">
            <div className="sun-disc" /><div className="roof roof-back" /><div className="house-body" />
            <div className="roof roof-front" /><div className="door"><i /><i /></div>
            <div className="lantern lantern-left">灯</div><div className="lantern lantern-right">灯</div>
            <div className="path" />
          </div>
        </section>

        <section className="principle-strip" aria-label="AKARI principles">
          <p>Not another feed.</p><i /> <p>Not a follower race.</p><i /> <p>A house built for trust.</p>
        </section>

        <section className="rooms-section" id="rooms">
          <div className="section-heading">
            <span className="eyebrow">Inside the House</span>
            <h2>Different rooms.<br />One shared table.</h2>
            <p>Your identity stays whole while each role gives you a focused place to work.</p>
          </div>
          <div className="room-grid">
            {rooms.map((room) => (
              <article className="room-card" key={room.number}>
                <span className="room-number">{room.number}</span>
                <span className="room-audience">{room.audience}</span>
                <h3>{room.title}</h3>
                <p>{room.copy}</p>
                <span className="room-link">Coming into focus <b>↗</b></span>
              </article>
            ))}
          </div>
        </section>

        <section className="membership-section" id="membership">
          <span className="eyebrow">Membership desk</span>
          <h2>One identity.<br /><em>Every role you hold.</em></h2>
          <p>Join as a founder, creator, investor—or any combination. You control what the network can see.</p>
          <Link className="button button-primary" to="/register">Create your profile <span>→</span></Link>
        </section>
      </main>
      <footer><span>灯 AKARI House</span><p>Trust before reach. Relevance before noise.</p><small>© 2026 AKARI House</small></footer>
    </div>
  );
}
