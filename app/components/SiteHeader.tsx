import { Form, Link, NavLink } from "react-router";
import type { SessionUser } from "~/lib/domain";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="site-header">
      <Link to="/" className="wordmark" aria-label="AKARI House home">
        <span className="wordmark-mark">灯</span>
        <span>AKARI <i>House</i></span>
      </Link>
      <nav aria-label="Primary navigation">
        <NavLink to="/" end>House</NavLink>
        <a href="/#rooms">Rooms</a>
        <a href="/#membership">Membership</a>
      </nav>
      <div className="header-actions">
        {user ? (
          <>
            <Link className="text-link" to="/app">Dashboard</Link>
            <Form method="post" action="/logout"><button className="button button-quiet" type="submit">Log out</button></Form>
          </>
        ) : (
          <>
            <Link className="text-link" to="/login">Log in</Link>
            <Link className="button button-small" to="/register">Request membership</Link>
          </>
        )}
      </div>
    </header>
  );
}
