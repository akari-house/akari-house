import { Link } from "react-router";

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span className="footer-brand">
          <img
            src="/assets/optimized/akari-logo.webp"
            alt="AKARI"
            width={360}
            height={117}
          />
          <span>House</span>
        </span>
        <p>
          A private place for Founders, Creators and Investors to build what
          comes next, together.
        </p>
      </div>
      <nav aria-label="Footer">
        <Link to="/">The House</Link>
        <Link to="/projects">Projects</Link>
        <Link to="/events">Events</Link>
        <Link to="/archive">Archive</Link>
        <Link to="/#membership">Membership</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/community-guidelines">Community guidelines</Link>
        <a href="mailto:hello@akari.house">Contact</a>
      </nav>
      <small>© 2026 AKARI House</small>
    </footer>
  );
}
