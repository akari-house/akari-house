import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import type { Route } from "./+types/root";
import { RouteScrollReset } from "~/components/RouteScrollReset";
import { productionSecurityHeaders } from "~/lib/production-security.server";
import "./styles/app.css";
import "./styles/auth-experience.css";
import "./styles/project-needs.css";
import "./styles/footer.css";
import "./styles/footer-theme-fix.css";
import "./styles/opportunities.css";
import "./styles/opportunity-operations.css";
import "./styles/header-layout-fix.css";
import "./styles/product-ui-consistency.css";
import "./styles/profile-sharing.css";
import "./styles/member-presence.css";
import "./styles/admin-console.css";
import "./styles/verification-queue.css";
import "./styles/site-final-polish.css";
import "./styles/investor-house-reference.css";
import "./styles/house-workspace-shell.css";
import "./styles/house-workspace-art.css";
import "./styles/house-workspace-polish.css";
import "./styles/admin-operations-spacing.css";
import "./styles/launch-candidate-cleanup.css";

const productionOrigin = "https://akarihouse.com";
const socialImage = `${productionOrigin}/assets/optimized/arrival.webp`;
const siteDescription =
  "A private Web3 professional network where Founders, Creators and Investors build trusted relationships and measurable traction.";

const noIndexPrefixes = [
  "/app",
  "/admin",
  "/connections",
  "/notifications",
  "/settings",
  "/profile-card",
  "/integrations",
  "/__test__",
  "/media",
  "/logout",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/register",
  "/membership/check-email",
  "/report",
];

function shouldNoIndex(pathname: string) {
  if (
    noIndexPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  )
    return true;

  return [
    /^\/projects\/(?:new|manage)(?:\/|$)/,
    /^\/projects\/[^/]+\/(?:edit|needs|opportunity|diligence|documents)(?:\/|$)/,
    /^\/events\/(?:new|manage)(?:\/|$)/,
    /^\/events\/[^/]+\/edit(?:\/|$)/,
    /^\/campaigns\/[^/]+\/(?:work|settlement)(?:\/|$)/,
    /^\/deals\/[^/]+(?:\/|$)/,
  ].some((pattern) => pattern.test(pathname));
}

const homepageStructuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${productionOrigin}/#website`,
      name: "AKARI House",
      url: `${productionOrigin}/`,
      description: siteDescription,
      inLanguage: "en-GB",
    },
    {
      "@type": "Organization",
      "@id": `${productionOrigin}/#organization`,
      name: "AKARI House",
      url: `${productionOrigin}/`,
      logo: `${productionOrigin}/assets/brand/favicon.png`,
      description: siteDescription,
    },
  ],
});

export const headers: Route.HeadersFunction = () => productionSecurityHeaders();

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/assets/brand/favicon.ico", sizes: "any" },
  {
    rel: "icon",
    href: "/assets/brand/favicon.png",
    type: "image/png",
    sizes: "64x64",
  },
  {
    rel: "apple-touch-icon",
    href: "/assets/brand/apple-touch-icon.png",
  },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap",
  },
  {
    rel: "preload",
    href: "/assets/optimized/arrival.webp",
    as: "image",
    type: "image/webp",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const noIndex = shouldNoIndex(pathname);
  const canonicalPath =
    pathname === "/" ? "/" : pathname.replace(/\/+$/, "") || "/";
  const canonicalUrl = `${productionOrigin}${canonicalPath}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#090b14" />
        <meta name="color-scheme" content="dark" />
        <meta name="application-name" content="AKARI House" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="AKARI House" />
        <meta name="format-detection" content="telephone=no" />
        <meta
          name="robots"
          content={
            noIndex
              ? "noindex, nofollow"
              : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
          }
        />
        {!noIndex && <link rel="canonical" href={canonicalUrl} />}
        <meta property="og:site_name" content="AKARI House" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_GB" />
        <meta property="og:title" content="AKARI House" />
        <meta property="og:description" content={siteDescription} />
        {!noIndex && <meta property="og:url" content={canonicalUrl} />}
        <meta property="og:image" content={socialImage} />
        <meta property="og:image:alt" content="The entrance to AKARI House" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AKARI House" />
        <meta name="twitter:description" content={siteDescription} />
        <meta name="twitter:image" content={socialImage} />
        {pathname === "/" && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: homepageStructuredData }}
          />
        )}
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <RouteScrollReset />
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message =
    status === 404
      ? "This room does not exist."
      : status === 403
        ? "This room is private."
        : status === 503
          ? "This room is being prepared."
          : "The lantern went out unexpectedly.";

  return (
    <main className="error-page">
      <span className="eyebrow">AKARI House · {status}</span>
      <h1>{message}</h1>
      <p>Please return to the Hall and try again.</p>
      <a className="button button-primary" href="/">
        Return home
      </a>
    </main>
  );
}
