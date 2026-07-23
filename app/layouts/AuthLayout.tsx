import { Link } from "react-router";

export function AuthLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="auth-layout">
      <Link className="auth-brand" to="/">
        <img src="/assets/brand/akari-logo.png" alt="AKARI" />
        <span>House</span>
      </Link>
      <section className="auth-panel">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
      </section>
      <aside className="auth-art" aria-hidden="true">
        <div className="moon" />
        <div className="torii">
          <span />
          <span />
          <span />
        </div>
        <p>
          Enter with intention.
          <br />
          Connect with trust.
        </p>
      </aside>
    </main>
  );
}
