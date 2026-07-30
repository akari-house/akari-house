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
import { PartnerStrip } from "~/components/HouseDirectory";
import {
  HouseMemberPresence,
  type HouseRolePresence,
} from "~/components/HouseMemberPresence";
import { caseStudies } from "~/data/case-studies";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { getPublishedHouseDirectory } from "~/lib/house-directory.server";
import type { Role } from "~/lib/domain";
import { Link } from "react-router";

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

interface HomepageMemberRow {
  username: string;
  displayName: string;
  avatarKey: string;
  publicCount: number;
}

interface HomepageRoleCountRow {
  totalCount: number;
}

export async function loadHomepageRolePresence(
  db: D1Database,
  role: Extract<Role, "creator" | "investor">,
): Promise<HouseRolePresence> {
  const [total, rows] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(DISTINCT u.id) AS totalCount
         FROM users u
         JOIN membership_applications ma
           ON ma.user_id = u.id AND ma.status = 'approved'
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.status = 'active' AND ur.role = ?`,
      )
      .bind(role)
      .first<HomepageRoleCountRow>(),
    db
      .prepare(
        `WITH visible_members AS (
           SELECT u.username, p.display_name AS displayName,
                  COALESCE(p.avatar_key, '') AS avatarKey,
                  p.updated_at AS updatedAt
           FROM users u
           JOIN membership_applications ma
             ON ma.user_id = u.id AND ma.status = 'approved'
           JOIN profiles p ON p.user_id = u.id
           LEFT JOIN profile_visibility pv ON pv.user_id = u.id
           JOIN user_roles ur ON ur.user_id = u.id
           WHERE u.status = 'active'
             AND ur.role = ?
             AND COALESCE(pv.visibility, p.visibility) = 'public'
         )
         SELECT username, displayName, avatarKey,
                COUNT(*) OVER() AS publicCount
         FROM visible_members
         ORDER BY CASE WHEN avatarKey = '' THEN 1 ELSE 0 END,
                  updatedAt DESC, displayName COLLATE NOCASE
         LIMIT 10`,
      )
      .bind(role)
      .all<HomepageMemberRow>(),
  ]);

  return {
    totalCount: total?.totalCount ?? 0,
    publicCount: rows.results[0]?.publicCount ?? 0,
    members: rows.results.map((member) => ({
      username: member.username,
      displayName: member.displayName,
      hasAvatar: Boolean(member.avatarKey),
    })),
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, project, event, directory, creators, investors] =
    await Promise.all([
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
                  e.starts_at AS startsAt, e.ends_at AS endsAt,
                  e.timezone, e.capacity,
                  e.image_key AS imageKey,
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
            endsAt: string;
            timezone: string;
            capacity: number | null;
            imageKey: string | null;
            hostName: string;
            registeredCount: number;
          }>(),
      ),
      optionalHomepageValue(() => getPublishedHouseDirectory(db)),
      optionalHomepageValue(() => loadHomepageRolePresence(db, "creator")),
      optionalHomepageValue(() => loadHomepageRolePresence(db, "investor")),
    ]);
  const emptyPresence: HouseRolePresence = {
    totalCount: 0,
    publicCount: 0,
    members: [],
  };
  return {
    user,
    project: project ?? null,
    event: event ?? null,
    partners: (directory ?? []).filter(
      (entry) => entry.category === "partner" || entry.category === "provider",
    ),
    memberPresence: {
      creators: creators ?? emptyPresence,
      investors: investors ?? emptyPresence,
    },
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
              <p>
                A private Web3 professional network where Founders, Creators
                and Investors discover relevant people, opportunities and
                trusted collaborations.
              </p>
              <div>
                <Link className="button button-primary" to="/register">
                  Apply to join <span aria-hidden="true">→</span>
                </Link>
                <ScrollTo className="quiet-link" targetId="hall">
                  Explore the House
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
          <p>Choose the role that best reflects how you participate.</p>
          <div>
            <Link to="/register?role=founder">
              <span>Founder</span>
              <strong>Find relevant support</strong>
            </Link>
            <Link to="/register?role=creator">
              <span>Creator</span>
              <strong>Present work with context</strong>
            </Link>
            <Link to="/register?role=investor">
              <span>Investor</span>
              <strong>Review considered opportunities</strong>
            </Link>
          </div>
        </section>

        <section className="home-trust-strip" aria-label="AKARI membership principles">
          <span>Human-reviewed membership</span>
          <span>Private by default</span>
          <span>Permission-controlled introductions</span>
          <span>Authorized outcomes in the Archive</span>
        </section>

        <HouseMemberPresence
          creators={loaderData.memberPresence.creators}
          investors={loaderData.memberPresence.investors}
        />

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

        <PartnerStrip entries={loaderData.partners} />

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
