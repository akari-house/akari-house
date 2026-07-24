import { Link } from "react-router";
import type { Route } from "./+types/legal";
import { PublicFooter } from "~/components/PublicFooter";
import { SiteHeader } from "~/components/SiteHeader";
import {
  legalContactEmail,
  legalDocumentByPath,
  legalDocuments,
} from "~/content/legal-documents";
import { getOptionalUser } from "~/lib/auth.server";
import { cloudflareContext } from "~/lib/cloudflare-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const document = legalDocumentByPath[new URL(request.url).pathname];
  if (!document) throw new Response("Not found", { status: 404 });
  const user = await getOptionalUser(
    request,
    context.get(cloudflareContext).env.DB,
  );
  return { document, user };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.document.title ?? "Policy"} | AKARI House` },
    { name: "description", content: loaderData?.document.intro ?? "" },
  ];
}

export default function Legal({ loaderData }: Route.ComponentProps) {
  const { document } = loaderData;
  return (
    <div className="site-shell legal-shell">
      <SiteHeader user={loaderData.user} />
      <main id="main-content" className="legal-main">
        <nav className="legal-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">The House</Link>
          <span aria-hidden="true">/</span>
          <span>Legal</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{document.shortTitle}</span>
        </nav>
        <header className="legal-header">
          <span className="eyebrow">{document.eyebrow}</span>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
          <dl className="legal-meta">
            <div>
              <dt>Effective</dt>
              <dd>{document.effectiveDate}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{document.version}</dd>
            </div>
          </dl>
        </header>
        <aside className="legal-summary" aria-labelledby="legal-summary-title">
          <span className="chapter">In plain language</span>
          <h2 id="legal-summary-title">The important points first</h2>
          <ul>
            {document.summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <small>This summary helps navigation; the full text below governs.</small>
        </aside>
        <details className="legal-mobile-toc">
          <summary>On this page</summary>
          <nav aria-label="Document sections">
            {document.sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`}>
                {index + 1}. {section.title}
              </a>
            ))}
          </nav>
        </details>
        <div className="legal-document-layout">
          <nav className="legal-toc" aria-label="Document sections">
            <span>On this page</span>
            {document.sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                {section.title}
              </a>
            ))}
          </nav>
          <article className="legal-sections">
            {document.sections.map((section, index) => (
              <section id={section.id} key={section.id}>
                <span className="legal-section-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2>
                  <a href={`#${section.id}`}>{section.title}</a>
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
        </div>
        <footer className="legal-document-footer">
          <div>
            <span className="chapter">Questions or rights requests</span>
            <a href={`mailto:${legalContactEmail}`}>{legalContactEmail}</a>
          </div>
          <nav aria-label="Related legal documents">
            {Object.values(legalDocuments)
              .filter((item) => item.key !== document.key)
              .map((item) => (
                <Link key={item.key} to={item.path}>
                  {item.shortTitle}
                </Link>
              ))}
          </nav>
        </footer>
      </main>
      <PublicFooter />
    </div>
  );
}
