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
import "./styles/r77-launch-completion.css";
import "./styles/r78-authenticated-density.css";
import "./styles/r91-launch-experience.css";

const productionOrigin = "https://akarihouse.com";
const socialImage = `${productionOrigin}/assets/optimized/arrival-1440.webp`;
const siteDescription =
  "A private professional network where Founders, Creators and Investors discover trusted people, opportunities and collaborations.";

const noIndexPrefixes = [
  "/app",
  "/admin",
  "/connections",
  "/members",
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

type PageSeo = {
  title: string;
  description: string;
};

function pageSeo(pathname: string): PageSeo {
  if (pathname === "/") {
    return {
      title: "AKARI House | Founder, Creator & Investor Network",
      description: siteDescription,
    };
  }
  if (pathname === "/campaigns") {
    return {
      title: "Creator Campaigns | AKARI House",
      description:
        "Find reviewed Creator campaigns, understand eligibility and deadlines, and work with published Founder projects.",
    };
  }
  if (/^\/campaigns\/[^/]+$/.test(pathname)) {
    return {
      title: "Creator Campaign | AKARI House",
      description:
        "Review the campaign brief, eligibility, deliverables, deadline and application status inside AKARI House.",
    };
  }
  if (pathname === "/deals") {
    return {
      title: "Investor Opportunities | AKARI House",
      description:
        "Review selected Founder opportunity previews and request controlled diligence access through AKARI House.",
    };
  }
  if (/^\/deals\/[^/]+$/.test(pathname)) {
    return {
      title: "Private Opportunity Room | AKARI House",
      description:
        "A permissioned AKARI House diligence space for approved Investors and authorised access.",
    };
  }
  if (pathname === "/projects") {
    return {
      title: "Founder Projects | AKARI House",
      description:
        "Explore reviewed Founder projects, their current needs and opportunities for trusted collaboration.",
    };
  }
  if (/^\/projects\/[^/]+$/.test(pathname)) {
    return {
      title: "Founder Project | AKARI House",
      description:
        "Understand a Founder project, its story, current needs and available collaboration paths.",
    };
  }
  if (pathname === "/events") {
    return {
      title: "Events | AKARI House",
      description:
        "Discover reviewed AKARI House gatherings, online sessions and community events.",
    };
  }
  if (/^\/events\/[^/]+$/.test(pathname)) {
    return {
      title: "AKARI Event | AKARI House",
      description:
        "Review event details, timing and participation information for an AKARI House gathering.",
    };
  }
  if (pathname === "/members") {
    return {
      title: "Member Directory | AKARI House",
      description:
        "Discover approved Founders, Creators and Investors through privacy-aware AKARI House profiles.",
    };
  }
  if (/^\/profiles\/[^/]+$/.test(pathname)) {
    return {
      title: "Member Profile | AKARI House",
      description:
        "A privacy-aware AKARI House member profile with professional context and collaboration interests.",
    };
  }
  if (pathname === "/archive" || pathname.startsWith("/archive/")) {
    return {
      title: "Evidence Archive | AKARI House",
      description:
        "Review selected AKARI House work, collaboration evidence and project outcomes.",
    };
  }
  if (pathname === "/team") {
    return {
      title: "Team | AKARI House",
      description:
        "Meet the people stewarding AKARI House and its trusted professional network.",
    };
  }
  if (pathname === "/membership") {
    return {
      title: "Membership | AKARI House",
      description:
        "Learn how AKARI House membership, professional identity and role access work.",
    };
  }
  if (pathname === "/hall" || pathname.startsWith("/rooms/")) {
    return {
      title: "The House | AKARI House",
      description:
        "Explore the rooms and collaboration journey that shape the AKARI House experience.",
    };
  }
  if (pathname === "/contact") {
    return {
      title: "Contact | AKARI House",
      description: "Contact the AKARI House team about membership and the network.",
    };
  }
  if (pathname === "/privacy") {
    return {
      title: "Privacy Notice | AKARI House",
      description: "Read how AKARI House handles privacy and member information.",
    };
  }
  if (pathname === "/terms") {
    return {
      title: "Terms | AKARI House",
      description: "Read the terms that apply to AKARI House membership and use.",
    };
  }
  if (pathname === "/community-guidelines") {
    return {
      title: "Community Guidelines | AKARI House",
      description:
        "Read the standards that support trusted collaboration inside AKARI House.",
    };
  }
  if (pathname === "/login") {
    return {
      title: "Log in | AKARI House",
      description: "Log in to your private AKARI House workspace.",
    };
  }
  if (pathname === "/register") {
    return {
      title: "Request Membership | AKARI House",
      description: "Request access to the private AKARI House network.",
    };
  }
  if (pathname.startsWith("/admin")) {
    return {
      title: "Administration | AKARI House",
      description: "Private AKARI House administration workspace.",
    };
  }
  if (pathname === "/app") {
    return {
      title: "My House | AKARI House",
      description: "Your private AKARI House profile and role workspaces.",
    };
  }
  if (pathname.startsWith("/settings/")) {
    return {
      title: "Settings | AKARI House",
      description: "Private AKARI House account and workspace settings.",
    };
  }

  return {
    title: "AKARI House",
    description: siteDescription,
  };
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
    sizes: "180x180",
  },
  { rel: "manifest", href: "/site.webmanifest" },
  { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const noIndex = shouldNoIndex(pathname);
  const seo = pageSeo(pathname);
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
        <Meta />
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
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
        <meta property="og:title" content={seo.title} />
        <meta property="og:description" content={seo.description} />
        {!noIndex && <meta property="og:url" content={canonicalUrl} />}
        <meta property="og:image" content={socialImage} />
        <meta property="og:image:alt" content="The entrance to AKARI House" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.title} />
        <meta name="twitter:description" content={seo.description} />
        <meta name="twitter:image" content={socialImage} />
        {pathname === "/" && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: homepageStructuredData }}
          />
        )}
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
