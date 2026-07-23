import type { Route } from "./+types/case-study";
import { getCaseStudy } from "~/data/case-studies";
import { SiteHeader } from "~/components/SiteHeader";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const study = getCaseStudy(params.slug);
  if (!study) throw new Response("Not found", { status: 404 });
  return {
    study,
    user: await getOptionalUser(request, context.get(cloudflareContext).env.DB),
  };
}
export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.study.title ?? "Case study"} — AKARI House` },
  ];
}
export default function CaseStudy({ loaderData }: Route.ComponentProps) {
  const c = loaderData.study;
  return (
    <div className="site-shell case-page">
      <SiteHeader user={loaderData.user} />
      <main id="main-content">
        <header>
          <span className="chapter">{c.category} · Authorized case study</span>
          <h1>{c.title}</h1>
          <p>{c.summary}</p>
          <div className="case-metrics">
            {c.metrics.map(([l, v]) => (
              <div key={l}>
                <strong>{v}</strong>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </header>
        <section className="case-story">
          <article>
            <h2>Challenge</h2>
            <p>{c.challenge}</p>
          </article>
          <article>
            <h2>AKARI contribution</h2>
            <p>{c.solution}</p>
          </article>
          <article>
            <h2>Results</h2>
            <ul>
              {c.results.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </article>
        </section>
        <section className="evidence-gallery">
          <div>
            <span className="chapter">Document-supported evidence</span>
            <h2>Proof behind the outcome.</h2>
            <p>
              Imported from AKARI Club with publication permission confirmed.
            </p>
          </div>
          {c.images.map((img, i) => (
            <a
              href={`/assets/case-studies/${img}`}
              target="_blank"
              rel="noreferrer"
              key={img}
            >
              <img
                src={`/assets/case-studies/${img}`}
                alt={`${c.title} evidence ${i + 1}`}
                loading="lazy"
              />
            </a>
          ))}
        </section>
      </main>
    </div>
  );
}
