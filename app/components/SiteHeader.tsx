import { useEffect, useRef, useState } from "react";
import { Form, Link, useLocation } from "react-router";
import { Icon } from "~/components/Icon";
import { JourneyBack } from "~/components/JourneyBack";
import type { SessionUser } from "~/lib/domain";

const links = [
  ["The House", "/"],
  ["Projects", "/projects"],
  ["Opportunities", "/deals"],
  ["Campaigns", "/campaigns"],
  ["Events", "/events"],
  ["Archive", "/archive"],
  ["Membership", "/membership"],
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInteractive(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trigger = menuRef.current;
    const drawer = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    const background = [
      ...document.querySelectorAll<HTMLElement>(
        "#main-content, .public-footer, .story-progress",
      ),
    ];
    const previousInert = background.map((element) => element.inert);
    document.body.style.overflow = "hidden";
    background.forEach((element) => {
      element.inert = true;
    });
    const focusInitial = () => {
      drawer
        ?.querySelector<HTMLElement>("[data-drawer-initial-focus]")
        ?.focus();
    };
    drawer?.addEventListener("transitionend", focusInitial, { once: true });
    const focusTimer = window.setTimeout(focusInitial, 600);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [
        ...drawerRef.current.querySelectorAll<HTMLElement>(
          "a,button:not([disabled])",
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(focusTimer);
      drawer?.removeEventListener("transitionend", focusInitial);
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      document.removeEventListener("keydown", handleKey);
      trigger?.focus();
    };
  }, [open]);

  const memberInitial =
    user?.displayName?.trim().charAt(0).toUpperCase() || "A";
  const actions = user ? (
    <div className="header-member-actions">
      <Link className="header-account-link" to="/app">
        <span className="header-account-mark" aria-hidden="true">
          {memberInitial}
        </span>
        <span>My House</span>
      </Link>
      <Link className="header-update-link" to="/notifications">
        Updates
      </Link>
      <Form method="post" action="/logout">
        <button className="header-logout" type="submit">
          Log out
        </button>
      </Form>
    </div>
  ) : (
    <>
      <Link className="text-link" to="/login">
        Log in
      </Link>
      <Link className="button button-small button-primary" to="/register">
        Apply to join
      </Link>
    </>
  );

  const isCurrent = (href: string) => {
    const [path] = href.split("#");
    if (path === "/") return location.pathname === "/";
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const memberLinks = user
    ? [
        ["Dashboard", "/app"],
        ["Projects", "/projects"],
        ["Opportunities", "/deals"],
        ["Campaigns", "/campaigns"],
        ...(user.accessTier === "member" && user.roles.includes("founder")
          ? [["My projects", "/projects/manage"]]
          : []),
        ...(user.accessTier === "member" && user.roles.includes("investor")
          ? [["Investor preferences", "/settings/investor"]]
          : []),
        ["Events", "/events"],
        ["Connections", "/connections"],
        ["Discover members", "/members"],
        ["Notifications", "/notifications"],
        ["Telegram", "/settings/telegram"],
        ["Account & privacy", "/settings/account"],
      ]
    : [];
  const isCurrentMemberLink = (href: string) => {
    const [path] = href.split("#");
    return location.pathname === path;
  };

  const mobileActions = user ? (
    <Form method="post" action="/logout">
      <button className="button button-quiet" type="submit">
        Log out
      </button>
    </Form>
  ) : (
    actions
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="wordmark" aria-label="AKARI House home">
          <img
            className="wordmark-image"
            src="/assets/optimized/akari-logo.webp"
            alt="AKARI"
            width={360}
            height={117}
          />
          <span>House</span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {links.map(([label, href]) => (
            <a
              href={href}
              key={label}
              aria-current={isCurrent(href) ? "page" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          {actions}
          <button
            ref={menuRef}
            className="menu-button"
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close navigation" : "Open navigation"}
            disabled={!interactive}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </header>
      <JourneyBack hidden={open} />
      <div
        className={`drawer-scrim${open ? " is-open" : ""}`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div
        ref={drawerRef}
        className={`mobile-drawer${open ? " is-open" : ""}`}
        id="mobile-menu"
        aria-hidden={!open}
        aria-label="Site navigation"
        aria-modal={open}
        role="dialog"
      >
        <button
          className="mobile-drawer-close"
          type="button"
          data-drawer-initial-focus
          onClick={() => setOpen(false)}
        >
          <Icon name="close" />
          <span>Close menu</span>
        </button>
        <nav aria-label="Mobile navigation">
          {links.map(([label, href]) => (
            <a
              href={href}
              key={label}
              aria-current={isCurrent(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
        </nav>
        {user && (
          <nav className="mobile-member-nav" aria-label="Your AKARI account">
            <span>Your House</span>
            {memberLinks.map(([label, href]) => (
              <Link
                to={href}
                key={label}
                aria-current={isCurrentMemberLink(href) ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <div className="mobile-actions">{mobileActions}</div>
      </div>
    </>
  );
}
