import type { Route } from "./+types/sitemap";
import { cloudflareContext } from "~/lib/cloudflare-context";

const origin = "https://akarihouse.com";
const staticPaths = [
  "/",
  "/hall",
  "/archive",
  "/team",
  "/projects",
  "/campaigns",
  "/events",
  "/deals",
  "/membership",
  "/contact",
  "/privacy",
  "/terms",
  "/community-guidelines",
];

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sitemapEntry(path: string, updatedAt?: string | null) {
  const lastmod = updatedAt?.slice(0, 10);
  return [
    "  <url>",
    `    <loc>${escapeXml(`${origin}${path}`)}</loc>`,
    ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []),
    "  </url>",
  ].join("\n");
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = context.get(cloudflareContext).env.DB;
  const [projects, campaigns, events] = await Promise.all([
    db
      .prepare(
        "SELECT slug, updated_at AS updatedAt FROM projects WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1000",
      )
      .all<{ slug: string; updatedAt: string }>(),
    db
      .prepare(
        "SELECT slug, updated_at AS updatedAt FROM ambassador_campaigns WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1000",
      )
      .all<{ slug: string; updatedAt: string }>(),
    db
      .prepare(
        "SELECT slug, updated_at AS updatedAt FROM events WHERE status = 'published' ORDER BY updated_at DESC LIMIT 1000",
      )
      .all<{ slug: string; updatedAt: string }>(),
  ]);

  const entries = [
    ...staticPaths.map((path) => sitemapEntry(path)),
    ...projects.results.map((item) =>
      sitemapEntry(`/projects/${encodeURIComponent(item.slug)}`, item.updatedAt),
    ),
    ...campaigns.results.map((item) =>
      sitemapEntry(`/campaigns/${encodeURIComponent(item.slug)}`, item.updatedAt),
    ),
    ...events.results.map((item) =>
      sitemapEntry(`/events/${encodeURIComponent(item.slug)}`, item.updatedAt),
    ),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
