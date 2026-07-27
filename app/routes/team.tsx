import type { Route } from "./+types/team";
import { PeopleCard, PartnerStrip } from "~/components/HouseDirectory";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
import { getPublishedHouseDirectory } from "~/lib/house-directory.server";

export const meta: Route.MetaFunction = () => [
  { title: "The People of AKARI | AKARI House" },
  {
    name: "description",
    content:
      "Meet the AKARI team, advisors, supporters, partners and value-added providers.",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [user, entries] = await Promise.all([
    getOptionalUser(request, db),
    getPublishedHouseDirectory(db),
  ]);
  return { user, entries };
}

const sections = [
  {
    category: "team",
    id: "team",
    chapter: "Chapter 01 · The keepers",
    title: "The AKARI Team",
    copy: "The people building, operating and caring for the House.",
  },
  {
    category: "advisor",
    id: "advisors",
    chapter: "Chapter 02 · The council",
    title: "AKARI Advisors",
    copy: "Experienced voices who challenge our thinking and strengthen our decisions.",
  },
  {
    category: "supporter",
    id: "supporters",
    chapter: "Chapter 03 · The lanterns",
    title: "Supporters of the House",
    copy: "People who open doors, share context and help the network move with integrity.",
  },
] as const;

export default function TeamPage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell people-page">
      <SiteHeader user={loaderData.user} />
      <main id="main-content">
        <header className="people-hero">
          <div>
            <span className="chapter">Inside the House</span>
            <h1>The people who keep the light on.</h1>
            <p>
              AKARI is built through care, judgment and trusted relationships.
              Meet the people and organizations helping the House grow.
            </p>
          </div>
          <img
            src="/assets/optimized/akari-mark.webp"
            alt=""
            width={240}
            height={225}
          />
        </header>
        {sections.map((section) => {
          const people = loaderData.entries.filter(
            (entry) => entry.category === section.category,
          );
          return (
            <section
              className="people-section chapter-section"
              id={section.id}
              key={section.category}
            >
              <div className="section-intro">
                <div>
                  <span className="chapter">{section.chapter}</span>
                  <h2>{section.title}</h2>
                </div>
                <p>{section.copy}</p>
              </div>
              {people.length ? (
                <div className="people-grid">
                  {people.map((entry) => (
                    <PeopleCard entry={entry} key={entry.id} />
                  ))}
                </div>
              ) : (
                <div className="people-empty">
                  <img
                    src="/assets/optimized/akari-mark.webp"
                    alt=""
                    width={80}
                    height={75}
                  />
                  <p>This chapter is being prepared.</p>
                </div>
              )}
            </section>
          );
        })}
        <PartnerStrip
          entries={loaderData.entries.filter(
            (entry) =>
              entry.category === "partner" || entry.category === "provider",
          )}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
