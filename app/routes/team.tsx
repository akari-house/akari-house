import { Link } from "react-router";
import type { Route } from "./+types/team";
import { PeopleCard, PartnerStrip } from "~/components/HouseDirectory";
import { ProjectLanternCard } from "~/components/discovery/ProjectLanternCard";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { getPublishedHouseDirectory } from "~/lib/house-directory.server";

type EcosystemProject = {
  slug: string;
  title: string;
  summary: string;
  stage: string;
  seeking: string;
  founderName: string;
  founderUsername: string;
  followerCount: number;
};

export const meta: Route.MetaFunction = () => [
  { title: "The People of AKARI | AKARI House" },
  {
    name: "description",
    content:
      "Meet the AKARI team, advisors, supporters, partners and ecosystem projects.",
  },
];

async function getEcosystemProjects(db: D1Database) {
  try {
    const projects = await db
      .prepare(
        `SELECT pr.slug, pr.title, pr.summary, pr.stage, pr.seeking,
                COALESCE(p.display_name, u.username, 'AKARI Founder') AS founderName,
                u.username AS founderUsername,
                COUNT(DISTINCT pf.user_id) AS followerCount
         FROM projects pr
         JOIN users u ON u.id = pr.founder_user_id
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN project_follows pf ON pf.project_id = pr.id
         WHERE pr.status = 'published'
         GROUP BY pr.id
         ORDER BY pr.updated_at DESC
         LIMIT 12`,
      )
      .all<EcosystemProject>();
    return projects.results;
  } catch (error) {
    console.error("Ecosystem project query failed.", error);
    return [] as EcosystemProject[];
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, entries, ecosystemProjects] = await Promise.all([
    getOptionalUser(request, db),
    getPublishedHouseDirectory(db),
    getEcosystemProjects(db),
  ]);
  return { user, entries, ecosystemProjects };
}

const sections = [
  {
    category: "team",
    id: "team",
    chapterLabel: "The keepers",
    title: "The AKARI Team",
    copy: "The people building, operating and caring for the House.",
  },
  {
    category: "advisor",
    id: "advisors",
    chapterLabel: "The council",
    title: "AKARI Advisors",
    copy: "Experienced voices who challenge our thinking and strengthen our decisions.",
  },
  {
    category: "supporter",
    id: "supporters",
    chapterLabel: "The lanterns",
    title: "Supporters of the House",
    copy: "People who open doors, share context and help the network move with integrity.",
  },
] as const;

function chapterLabel(number: number, label: string) {
  return `Chapter ${number.toString().padStart(2, "0")} · ${label}`;
}

export default function TeamPage({ loaderData }: Route.ComponentProps) {
  const partnerEntries = loaderData.entries.filter(
    (entry) => entry.category === "partner" || entry.category === "provider",
  );
  const populatedPeopleSections = sections
    .flatMap((section) => {
      const people = loaderData.entries.filter(
        (entry) => entry.category === section.category,
      );
      return people.length ? [{ ...section, people }] : [];
    })
    .map((section, index) => ({ ...section, chapterNumber: index + 1 }));
  const partnerChapterNumber = populatedPeopleSections.length + 1;
  const ecosystemChapterNumber = partnerChapterNumber + 1;

  return (
    <div className="site-shell people-page">
      <SiteHeader user={loaderData.user} />
      <main id="main-content">
        <header className="people-hero people-house-hero">
          <picture className="people-house-hero__art" aria-hidden="true">
            <source
              media="(max-width: 620px)"
              srcSet="/assets/team/keepers-hero-mobile.svg"
            />
            <img
              src="/assets/team/keepers-hero.svg"
              alt=""
              width={1672}
              height={941}
              fetchPriority="high"
            />
          </picture>
          <div className="people-house-hero__copy">
            <span className="chapter">Inside AKARI House</span>
            <h1>The people who keep the light on.</h1>
            <p>
              Meet the builders, advisors and supporters who care for the House,
              alongside the partners and projects growing within its walls.
            </p>
            <nav
              className="people-house-hero__nav"
              aria-label="Explore this page"
            >
              <a href="#people">People</a>
              <a href="#partners">Partners</a>
              <a href="#ecosystem">Ecosystem</a>
            </nav>
          </div>
        </header>

        <div id="people">
          {populatedPeopleSections.length ? (
            populatedPeopleSections.map((section) => (
              <section
                className={`people-section people-section--${section.category} chapter-section`}
                id={section.id}
                key={section.category}
              >
                <div className="section-intro">
                  <div>
                    <span className="chapter">
                      {chapterLabel(
                        section.chapterNumber,
                        section.chapterLabel,
                      )}
                    </span>
                    <h2>{section.title}</h2>
                  </div>
                  <p>{section.copy}</p>
                </div>
                <div className="people-grid">
                  {section.people.map((entry) => (
                    <PeopleCard entry={entry} key={entry.id} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <section className="people-section chapter-section">
              <div className="people-empty people-empty--combined">
                <img
                  src="/assets/optimized/akari-mark.webp"
                  alt=""
                  width={54}
                  height={51}
                />
                <div>
                  <strong>The people directory is being prepared.</strong>
                  <p>
                    Published Team, Advisor and Supporter profiles appear here.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div id="partners">
          {partnerEntries.length ? (
            <PartnerStrip
              entries={partnerEntries}
              eyebrow={chapterLabel(partnerChapterNumber, "The wider House")}
            />
          ) : (
            <section className="partner-house chapter-section">
              <div className="section-intro">
                <div>
                  <span className="chapter">
                    {chapterLabel(partnerChapterNumber, "The wider House")}
                  </span>
                  <h2>Partners and value-added providers.</h2>
                </div>
                <p>
                  Trusted organizations and specialists who add practical value
                  to the AKARI network.
                </p>
              </div>
              <div className="people-empty">
                <p>The first partner lanterns are being prepared.</p>
              </div>
            </section>
          )}
        </div>

        <section
          className="ecosystem-house chapter-section"
          id="ecosystem"
          aria-labelledby="ecosystem-title"
        >
          <div className="section-intro">
            <div>
              <span className="chapter">
                {chapterLabel(ecosystemChapterNumber, "The growing ecosystem")}
              </span>
              <h2 id="ecosystem-title">Projects building inside the House.</h2>
            </div>
            <p>
              Published projects created by AKARI Founder members appear here as
              Ecosystem Projects. They are customers and network participants,
              not automatically AKARI partners or endorsements.
            </p>
          </div>
          {loaderData.ecosystemProjects.length ? (
            <div className="ecosystem-house__grid">
              {loaderData.ecosystemProjects.map((project) => (
                <ProjectLanternCard project={project} key={project.slug} />
              ))}
            </div>
          ) : (
            <div className="people-empty">
              <p>The first Ecosystem Projects are preparing their lanterns.</p>
            </div>
          )}
          <Link className="quiet-link" to="/projects">
            Explore all published projects →
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
