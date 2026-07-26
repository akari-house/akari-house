import type { Route } from "./+types/home";
import { FeaturedArchiveCarousel } from "~/components/archive/FeaturedArchiveCarousel";
import { HouseInMotion } from "~/components/discovery/HouseInMotion";
import { HouseHall } from "~/components/house/HouseHall";
import { InteractiveArrival } from "~/components/house/InteractiveArrival";
import { PetalField } from "~/components/house/PetalField";
import { StoryProgress } from "~/components/house/StoryProgress";
import { BlossomJourney } from "~/components/house/BlossomJourney";
import { MembershipDesk } from "~/components/membership/MembershipDesk";
import { SiteHeader } from "~/components/SiteHeader";
import { PublicFooter } from "~/components/PublicFooter";
import { ScrollTo } from "~/components/ScrollTo";
import { caseStudies } from "~/data/case-studies";
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

export async function optionalHomepageValue<T>(
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, project, event] = await Promise.all([
    optionalHomepageValue(() => getOptionalUser(request, db)),
    optionalHomepageValue(() =>
      db
        .prepare(
          `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
                  p.display_name AS founderName, u.username AS founderUsername,
                  COUNT(DISTINCT pf.user_id) AS followerCount
           FROM projects pr
           JOIN users u ON u.id = pr.founder_user_id
           JOIN profiles p ON p.user_id = u.id
           LEFT JOIN project_follows pf ON pf.project_id = pr.id
           WHERE pr.status = 'published'
           GROUP BY pr.id
           ORDER BY pr.updated_at DESC LIMIT 1`,
        )
        .first<{
          slug: string;
          title: string;
          summary: string;
          stage: string;
          seeking: string;
          founderName: string;
          founderUsername: string;
          followerCount: number;
        }>(),
    ),
    optionalHomepageValue(() =>
      db
        .prepare(
          `SELECT e.slug, e.title, e.summary, e.format, e.venue,
                  e.starts_at AS startsAt, e.timezone, e.capacity,
                  p.display_name AS hostName,
                  COUNT(CASE WHEN er.status = 'registered' THEN 1 END)
                    AS registeredCount
           FROM events e
           JOIN profiles p ON p.user_id = e.host_user_id
           LEFT JOIN event_registrations er ON er.event_id = e.id
           WHERE e.status = 'published' AND e.ends_at >= datetime('now')
           GROUP BY e.id ORDER BY e.starts_at LIMIT 1`,
        )
        .first<{
          slug: string;
          title: string;
          summary: string;
          format: string;
          venue: string;
          startsAt: string;
          timezone: string;
          capacity: number | null;
          hostName: string;
          registeredCount: number;
        }>(),
    ),
  ]);
  return {
    user,
    project: project ?? null,
    event: event ?? null,
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
                <ScrollTo className="button button-primary" targetId="hall">
                  Enter the House <span aria-hidden="true">→</span>
                </ScrollTo>
                <ScrollTo className="quiet-link" targetId="common">
                  Explore the experience
                </ScrollTo>
              </div>
            </div>
            <div className="arrival-threshold" aria-hidden="true">
              <span>The threshold</span>
              <strong>Three paths. One House.</strong>
            </div>
            <ScrollTo
              className="arrival-enter-cue"
              targetId="hall"
              ariaLabel="Enter the Hall"
            >
              <span>Enter the Hall</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="m7 9 5 5 5-5" />
              </svg>
            </ScrollTo>
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
            <ScrollTo targetId="hall">
              <span>Founder</span>
              <strong>Find relevant support</strong>
            </ScrollTo>
            <ScrollTo targetId="hall">
              <span>Creator</span>
              <strong>Present work with context</strong>
            </ScrollTo>
            <ScrollTo targetId="hall">
              <span>Investor</span>
              <strong>Review considered opportunities</strong>
            </ScrollTo>
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
          <HouseInMotion
            project={loaderData.project}
            event={loaderData.event}
            caseStudy={caseStudies[0]}
          />
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
            loading="lazy"
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
      <PublicFooter />
    </div>
  );
}
