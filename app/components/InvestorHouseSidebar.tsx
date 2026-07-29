import { Link } from "react-router";
import type { SessionUser } from "~/lib/domain";

type InvestorHouseCounts = {
  saved?: number;
  requested?: number;
  approved?: number;
};

type InvestorHouseSidebarProps = {
  user: SessionUser | null;
  activeView?: string;
  counts?: InvestorHouseCounts;
};

type SidebarItem = {
  label: string;
  href: string;
  glyph: string;
  view?: string;
  count?: keyof InvestorHouseCounts;
};

const primaryItems: SidebarItem[] = [
  { label: "House", href: "/app", glyph: "⌂" },
  { label: "Network", href: "/members", glyph: "◎" },
  { label: "Projects", href: "/projects", glyph: "◇" },
  { label: "Creator Campaigns", href: "/campaigns", glyph: "✦" },
  { label: "Events", href: "/events", glyph: "□" },
  { label: "Deals Room", href: "/deals", glyph: "❀", view: "available" },
];

const investorItems: SidebarItem[] = [
  { label: "Connections", href: "/connections", glyph: "∞" },
  { label: "Notifications", href: "/notifications", glyph: "◌" },
  {
    label: "Saved",
    href: "/deals?view=saved",
    glyph: "☆",
    view: "saved",
    count: "saved",
  },
  {
    label: "Access Requests",
    href: "/deals?view=requested",
    glyph: "↗",
    view: "requested",
    count: "requested",
  },
  {
    label: "My Deal Rooms",
    href: "/deals?view=approved",
    glyph: "▣",
    view: "approved",
    count: "approved",
  },
];

function SidebarLink({
  item,
  activeView,
  counts,
}: {
  item: SidebarItem;
  activeView?: string;
  counts?: InvestorHouseCounts;
}) {
  const active = item.view ? item.view === (activeView || "available") : false;
  const count = item.count ? counts?.[item.count] : undefined;

  return (
    <Link
      className={`investor-house-sidebar-link${active ? " is-active" : ""}`}
      to={item.href}
      aria-current={active ? "page" : undefined}
    >
      <span className="investor-house-sidebar-glyph" aria-hidden="true">
        {item.glyph}
      </span>
      <span>{item.label}</span>
      {Boolean(count) && <b>{count}</b>}
    </Link>
  );
}

export function InvestorHouseSidebar({
  user,
  activeView,
  counts,
}: InvestorHouseSidebarProps) {
  const houseHref = user ? "/app" : "/";
  const investorProfileHref = user
    ? "/settings/investor"
    : "/login?returnTo=/settings/investor";

  return (
    <aside className="investor-house-sidebar" aria-label="Investor House">
      <Link
        className="investor-house-sidebar-brand"
        to="/"
        aria-label="AKARI House"
      >
        <img
          src="/assets/optimized/akari-logo.webp"
          alt="AKARI"
          width={360}
          height={117}
        />
        <span>House</span>
      </Link>

      <nav aria-label="Investor House navigation">
        {primaryItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            activeView={activeView}
            counts={counts}
          />
        ))}

        <span className="investor-house-sidebar-section">
          Investor workspace
        </span>
        {investorItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            activeView={activeView}
            counts={counts}
          />
        ))}
      </nav>

      <div className="investor-house-sidebar-footer">
        <Link to={investorProfileHref}>
          <span aria-hidden="true">⚙</span>
          Investor Profile
        </Link>
        <Link to={user ? "/settings/account" : "/login"}>
          <span aria-hidden="true">◉</span>
          Account &amp; Privacy
        </Link>
        {user?.roles.includes("founder") && (
          <Link to="/app">
            <span aria-hidden="true">↔</span>
            Founder workspace
          </Link>
        )}
      </div>
    </aside>
  );
}
