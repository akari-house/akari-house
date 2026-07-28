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
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="error-page">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
