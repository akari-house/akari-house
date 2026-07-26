import { Link } from "react-router";

const footerGroups = [
  {
    title: "Network",
    links: [
      { label: "The House", to: "/" },
      { label: "Members", to: "/members" },
      { label: "Connections", to: "/connections" },
      { label: "Membership", to: "/membership" },
    ],
  },
  {
    title: "Opportunities",
    links: [
      { label: "Projects", to: "/projects" },
      { label: "Creator campaigns", to: "/campaigns" },
      { label: "Events", to: "/events" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Archive", to: "/archive" },
      { label: "Community guidelines", to: "/community-guidelines" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Company and contact", to: "/contact" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="site-footer akari-footer" aria-labelledby="footer-title">
      <div className="akari-footer__inner">
        <div className="akari-footer__navigation">
          <section className="akari-footer__brand" aria-labelledby="footer-title">
            <h2 id="footer-title" className="sr-only">
              AKARI House information
            </h2>
            <span className="footer-brand">
              <img
                src="/assets/optimized/akari-logo.webp"
                alt="AKARI"
                width={360}
                height={117}
                loading="lazy"
              />
              <span>House</span>
            </span>
            <p>
              A private professional network for Founders, Creators and
              Investors to build trusted relationships, collaborations and
              introductions.
            </p>
            <span className="akari-footer__principle">
              People first. Permission always.
            </span>
          </section>

          <nav className="akari-footer__links" aria-label="Footer navigation">
            {footerGroups.map((group) => (
              <section className="akari-footer__group" key={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={`${group.title}-${link.to}-${link.label}`}>
                      <Link to={link.to}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>

        <section
          className="akari-footer__disclosure"
          aria-labelledby="footer-disclosure-title"
        >
          <header>
            <span>Important information</span>
            <h2 id="footer-disclosure-title">
              Discovery is not a guarantee.
            </h2>
          </header>
          <div className="akari-footer__disclosure-copy">
            <p>
              AKARI House is a professional networking, discovery and
              collaboration platform. It does not provide investment,
              financial, legal or tax advice.
            </p>
            <p>
              Project review, member verification or access approval is not an
              endorsement. Early-stage and digital-asset opportunities can be
              illiquid and may involve a risk of total loss. Members remain
              responsible for independent due diligence and professional advice.
            </p>
            <p>
              Access may depend on membership, verification, eligibility,
              jurisdiction and specific approval. AKARI does not guarantee
              funding, investment, returns, token listings, campaign performance
              or commercial outcomes.
            </p>
            <p>
              AKARI does not custody investment funds or member assets through
              this platform. It supports professional profiles, controlled
              information sharing, introductions and collaboration. This wording
              remains subject to final legal review.
            </p>
          </div>
        </section>

        <div className="akari-footer__bottom">
          <small>© 2026 AKARI House. All rights reserved.</small>
          <small>
            Participation and access remain subject to AKARI review, applicable
            policies and relevant jurisdictional requirements.
          </small>
        </div>
      </div>
    </footer>
  );
}
