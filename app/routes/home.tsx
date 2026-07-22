import { Link } from "react-router";
import type { Route } from "./+types/home";
import { CommonTable } from "~/components/common-table/CommonTable";
import { HouseHall } from "~/components/house/HouseHall";
import { PetalField } from "~/components/house/PetalField";
import { SceneMotion } from "~/components/house/SceneMotion";
import { MembershipDesk } from "~/components/membership/MembershipDesk";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export const meta: Route.MetaFunction = () => [
  { title: "AKARI House — A private Web3 professional network" },
  {
    name: "description",
    content:
      "A private place where Founders, Creators and Investors build trusted relationships and measurable traction.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}

const journey = [
  ["門", "Entrance", "Build your identity"],
  ["策", "Strategy Room", "Define your goals"],
  ["縁", "Network Terrace", "Discover relevant people"],
  ["卓", "Common Table", "Collaborate privately"],
  ["光", "Launch Deck", "Create measurable traction"],
];

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <PetalField />
      <SceneMotion />
      <main id="main-content">
        <section
          className="arrival story-chapter"
          id="arrival"
          aria-labelledby="arrival-title"
        >
          <div
            className="arrival-media"
            role="img"
            aria-label="Founders, creators and investors arriving at a lantern-lit Inari sanctuary."
          />
          <div className="arrival-shade" />
          <div className="arrival-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="arrival-copy">
            <span className="chapter">Chapter 01 · The invitation</span>
            <h1 id="arrival-title">Welcome to AKARI House</h1>
            <p>A private place for people building what comes next.</p>
            <div>
              <a className="button button-primary" href="#hall">
                Follow the lanterns <span aria-hidden="true">→</span>
              </a>
              <a className="quiet-link" href="#common">
                Explore the experience
              </a>
            </div>
          </div>
        </section>

        <HouseHall />

        <section
          className="common-section chapter-section story-chapter"
          id="common"
          aria-labelledby="common-title"
        >
          <div className="section-intro">
            <div>
              <span className="chapter">Chapter 03 · The Common Table</span>
              <h2 id="common-title">Where the House becomes a product.</h2>
            </div>
            <p>
              One identity can hold multiple roles. Preview how AKARI keeps each
              workspace focused without splitting your profile.
            </p>
          </div>
          <CommonTable />
        </section>

        <section
          className="journey-section chapter-section story-chapter"
          id="journey"
          aria-labelledby="journey-title"
        >
          <div>
            <span className="chapter">Chapter 04 · The Blossom Journey</span>
            <h2 id="journey-title">A path through the House.</h2>
            <p>
              Trust grows through identity, intent, discovery, private
              collaboration and evidence—not through follower counts.
            </p>
          </div>
          <ol className="blossom-trail">
            {journey.map(([icon, title, copy]) => (
              <li key={title}>
                <span aria-hidden="true">{icon}</span>
                <div>
                  <strong>{title}</strong>
                  <small>{copy}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="archive-section chapter-section story-chapter"
          id="archive"
          aria-labelledby="archive-title"
        >
          <div className="archive-copy">
            <span className="chapter">Chapter 05 · The Archive</span>
            <h2 id="archive-title">Proof that can be inspected.</h2>
            <p>
              The Archive will document AKARI’s role, timeframe, evidence and
              permission status. Until verified member outcomes are available,
              this structure is clearly marked as a placeholder.
            </p>
          </div>
          <article className="archive-record">
            <div
              className="archive-image"
              role="img"
              aria-label="A quiet discussion in an AKARI room"
            />
            <div>
              <span className="status-pill">
                Structure preview · Not a published case study
              </span>
              <h3>From context to an attributable outcome.</h3>
              <dl>
                <div>
                  <dt>Relationship</dt>
                  <dd>Founder × strategic partner</dd>
                </div>
                <div>
                  <dt>AKARI contribution</dt>
                  <dd>Curated introduction and working context</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>Awaiting verified member evidence</dd>
                </div>
                <div>
                  <dt>Permission</dt>
                  <dd>Publication approval required</dd>
                </div>
              </dl>
            </div>
          </article>
        </section>

        <MembershipDesk />

        <section className="final-welcome" aria-labelledby="final-title">
          <img src="/assets/brand/akari-mark.png" alt="" />
          <span className="chapter">The door is open</span>
          <h2 id="final-title">
            Your role. Your network.
            <br />
            Your next opportunity.
          </h2>
          <Link className="button button-primary" to="/register">
            Apply to Join AKARI
          </Link>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <img src="/assets/brand/akari-logo.png" alt="AKARI" />
            <span>House</span>
          </span>
          <p>
            A private place for Founders, Creators and Investors to build what
            comes next—together.
          </p>
        </div>
        <nav aria-label="Footer">
          <a href="#hall">The Hall</a>
          <a href="#common">Common Table</a>
          <a href="#archive">Archive</a>
          <a href="#membership">Membership</a>
        </nav>
        <small>© 2026 AKARI House</small>
      </footer>
    </div>
  );
}
