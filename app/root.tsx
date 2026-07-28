import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
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
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#080b13" />
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
