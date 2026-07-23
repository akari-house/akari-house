import { Link } from "react-router";
import { caseStudies } from "~/data/case-studies";
import { SiteHeader } from "~/components/SiteHeader";
import type { Route } from "./+types/archive";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
export const meta = () => [
  { title: "The Archive | AKARI House" },
  { name: "description", content: "Evidence-backed AKARI case studies." },
];
export async function loader({ request, context }: Route.LoaderArgs) {
  return {
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}
export default function Archive({ loaderData }: Route.ComponentProps) {
  return (
    <div className="site-shell archive-page">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="archive-main">
        <span className="chapter">The Archive</span>
        <h1>Work that left evidence.</h1>
        <p>Authorized outcomes, connected to the proof behind each claim.</p>
        <div className="case-grid">
          {caseStudies.map((c) => (
            <Link className="case-card" to={`/archive/${c.slug}`} key={c.slug}>
              <img src={`/assets/case-studies/${c.images[0]}`} alt="" />
              <span>{c.category}</span>
              <h2>{c.title}</h2>
              <p>{c.summary}</p>
              <div>
                {c.metrics.slice(0, 3).map(([l, v]) => (
                  <small key={l}>
                    <b>{v}</b>
                    {l}
                  </small>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
