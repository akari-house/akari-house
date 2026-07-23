import { Link } from "react-router";
import type { Route } from "./+types/home";
import { FeaturedArchiveCarousel } from "~/components/archive/FeaturedArchiveCarousel";
import { CommonTable } from "~/components/common-table/CommonTable";
import { HouseHall } from "~/components/house/HouseHall";
import { InteractiveArrival } from "~/components/house/InteractiveArrival";
import { PetalField } from "~/components/house/PetalField";
import { StoryProgress } from "~/components/house/StoryProgress";
import { BlossomJourney } from "~/components/house/BlossomJourney";
import { MembershipDesk } from "~/components/membership/MembershipDesk";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export const meta: Route.MetaFunction = () => [
  { title: "AKARI House | A private Web3 professional network" },
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

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell">
      <SiteHeader user={loaderData.user} />
      <PetalField />
      <StoryProgress />
      <main id="main-content">
        <section
          className="arrival story-chapter"
          id="arrival"
          aria-labelledby="arrival-title"
        >
          <div className="arrival-frame">
            <InteractiveArrival />
            <div className="arrival-shade" />
            <div className="arrival-copy">
              <span className="chapter">Chapter 01 · The invitation</span>
              <h1 id="arrival-title">Welcome to AKARI House</h1>
              <p>A private place for people building what comes next.</p>
              <div>
                <a className="button button-primary" href="#hall">
                  Enter the House <span aria-hidden="true">→</span>
                </a>
                <a className="quiet-link" href="#common">
                  Explore the experience
                </a>
              </div>
            </div>
            <a
              className="arrival-enter-cue"
              href="#hall"
              aria-label="Enter the Hall"
            >
              <span>Enter the Hall</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m7 9 5 5 5-5" />
              </svg>
            </a>
          </div>
        </section>

        <section
          className="role-orientation"
          aria-label="What AKARI makes possible"
        >
          <p>
            Three paths enter the same trusted House. Choose the work that
            matters to you.
          </p>
          <div>
            <a href="#hall">
              <span>Founder</span>
              <strong>Find relevant support</strong>
            </a>
            <a href="#hall">
              <span>Creator</span>
              <strong>Present work with context</strong>
            </a>
            <a href="#hall">
              <span>Investor</span>
              <strong>Review considered opportunities</strong>
            </a>
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
              <h2 id="common-title">Take your seat at the shared table.</h2>
            </div>
            <p>
              Your seat changes with your role, while your identity stays whole.
              See how the House brings the right work into view.
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
              collaboration and evidence. Follower counts are not the measure.
            </p>
          </div>
          <BlossomJourney />
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
              The Archive Keeper records AKARI’s role, timeframe, evidence and
              permission status. Explore authorized outcomes with the proof
              behind every published claim.
            </p>
          </div>
          <FeaturedArchiveCarousel />
        </section>

        <MembershipDesk />

        <section className="final-welcome" aria-labelledby="final-title">
          <img
            src="/assets/optimized/akari-mark.webp"
            alt=""
            width={160}
            height={150}
          />
          <span className="chapter">Epilogue · The light stays on</span>
          <h2 id="final-title">
            Your role. Your network.
            <br />
            Your next opportunity.
          </h2>
          <p>When you are ready, the Membership Desk is waiting above.</p>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <img
              src="/assets/optimized/akari-logo.webp"
              alt="AKARI"
              width={360}
              height={117}
            />
            <span>House</span>
          </span>
          <p>
            A private place for Founders, Creators and Investors to build what
            comes next, together.
          </p>
        </div>
        <nav aria-label="Footer">
          <a href="#hall">The Hall</a>
          <a href="#common">Common Table</a>
          <Link to="/archive">Archive</Link>
          <a href="#membership">Membership</a>
          <a href="mailto:hello@akari.house">Contact</a>
        </nav>
        <small>© 2026 AKARI House</small>
      </footer>
    </div>
  );
}
