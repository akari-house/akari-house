import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";
import type { SessionUser } from "~/lib/domain";

const links = [
  ["House", "/#arrival"],
  ["The Hall", "/#hall"],
  ["Common Table", "/#common"],
  ["Archive", "/archive"],
  ["Projects", "/projects"],
  ["Events", "/events"],
  ["Membership", "/#membership"],
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a")?.focus();
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      trigger?.focus();
    };
  }, [open]);

  const actions = user ? (
    <>
      <Link className="text-link" to="/app">
        Dashboard
      </Link>
      <Link className="text-link" to="/notifications">
        Updates
      </Link>
      <Form method="post" action="/logout">
        <button className="button button-quiet" type="submit">
          Log out
        </button>
      </Form>
    </>
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
            <a href={href} key={label}>
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
            <span className="menu-glyph" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </header>
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
      >
        <nav aria-label="Mobile navigation">
          {links.map(([label, href]) => (
            <a href={href} key={label} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="mobile-actions">{actions}</div>
      </div>
    </>
  );
}
