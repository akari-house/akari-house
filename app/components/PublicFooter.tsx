import { Link } from "react-router";

const footerGroups = [
  {
    label: "Network",
    links: [
      ["The House", "/"],
      ["Members", "/members"],
      ["Connections", "/connections"],
      ["Membership", "/membership"],
    ],
  },
  {
    label: "Opportunities",
    links: [
      ["Projects", "/projects"],
      ["Selected opportunities", "/deals"],
      ["Creator campaigns", "/campaigns"],
      ["Events", "/events"],
    ],
  },
  {
    label: "Resources",
    links: [
      ["Archive", "/archive"],
      ["Community guidelines", "/community-guidelines"],
      ["Contact", "/contact"],
    ],
  },
  {
    label: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="site-footer public-footer">
      <div className="footer-navigation">
        <div className="footer-identity">
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
            A private professional network for Founders, Creators and Investors
            to build trusted relationships, collaborations and introductions.
          </p>
        </div>
        {footerGroups.map((group) => (
          <nav key={group.label} aria-label={`${group.label} footer links`}>
            <strong>{group.label}</strong>
            {group.links.map(([label, to]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <section
        className="footer-risk-information"
        aria-labelledby="footer-risk-title"
      >
        <div>
          <span className="eyebrow">Important information</span>
          <h2 id="footer-risk-title">Discovery is not a guarantee.</h2>
        </div>
        <div className="footer-risk-grid">
          <p>
            AKARI is a professional networking, discovery and collaboration
            platform. It does not provide investment, financial, legal or tax
            advice and does not guarantee funding, returns, token listings,
            campaign performance or commercial outcomes.
          </p>
          <p>
            Project review, member verification and controlled access do not
            constitute endorsement. Early-stage and digital-asset opportunities
            may involve substantial loss, illiquidity, operational failure and
            changing legal or regulatory requirements.
          </p>
          <p>
            Members must conduct independent due diligence and obtain
            appropriate professional advice. Access may be limited by membership
            status, verification, jurisdiction, eligibility and per-opportunity
            approval. AKARI records introductions and collaboration workflows;
            it does not hold member investment funds through this product.
          </p>
        </div>
        <small>Provisional information - final legal review required.</small>
      </section>

      <div className="footer-baseline">
        <small>© 2026 AKARI House. All rights reserved.</small>
        <small>
          Private network · Permission-based access · Independent decisions
        </small>
      </div>
    </footer>
  );
}
