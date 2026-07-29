import { Form, Link } from "react-router";
import { visibleAdminWorkspaceItems } from "~/lib/admin-workspace";
import type { SessionUser } from "~/lib/domain";

export type WorkspaceItem = {
  label: string;
  href: string;
  glyph: string;
  exact?: boolean;
};

const houseHomeItem: WorkspaceItem = {
  label: "House",
  href: "/app",
  glyph: "⌂",
  exact: true,
};

const discoveryItems: WorkspaceItem[] = [
  { label: "Members", href: "/members", glyph: "◎" },
  { label: "Connections", href: "/connections", glyph: "∞" },
  { label: "Projects", href: "/projects", glyph: "◇" },
  { label: "Creator Campaigns", href: "/campaigns", glyph: "✦" },
  { label: "Events", href: "/events", glyph: "□" },
  { label: "Deals Room", href: "/deals", glyph: "❀" },
  { label: "Notifications", href: "/notifications", glyph: "◌" },
];

const profileItems: WorkspaceItem[] = [
  { label: "Edit profile", href: "/app#profile-editor", glyph: "◉" },
  { label: "Profile sharing card", href: "/profile-card", glyph: "▣" },
  { label: "Telegram", href: "/settings/telegram", glyph: "↗" },
  { label: "Account & Privacy", href: "/settings/account", glyph: "⚙" },
];

function uniqueWorkspaceItems(items: WorkspaceItem[]) {
  return items.filter(
    (item, index) => items.findIndex((candidate) => candidate.href === item.href) === index,
  );
}

export function workspaceRoleItems(user: SessionUser): WorkspaceItem[] {
  if (user.accessTier !== "member") return [];

  return uniqueWorkspaceItems([
    ...(user.roles.includes("founder")
      ? [
          {
            label: "Manage projects",
            href: "/projects/manage",
            glyph: "◈",
          },
          {
            label: "Creator campaigns",
            href: "/campaigns",
            glyph: "✦",
          },
          {
            label: "Deals & investors",
            href: "/deals",
            glyph: "❀",
          },
        ]
      : []),
    ...(user.roles.includes("creator")
      ? [
          {
            label: "Find campaigns",
            href: "/campaigns",
            glyph: "✦",
          },
        ]
      : []),
    ...(user.roles.includes("investor")
      ? [
          {
            label: "Explore matched Deals",
            href: "/deals",
            glyph: "❀",
          },
          {
            label: "Investor preferences",
            href: "/settings/investor",
            glyph: "◫",
          },
        ]
      : []),
  ]);
}

/**
 * These routes keep the cinematic, chapter-led public House experience.
 * Operational children such as edit, manage, work and settlement routes are
 * intentionally excluded so they can use the CRM-style workspace shell.
 */
export function isImmersiveHousePath(pathname: string) {
  if (
    pathname === "/" ||
    pathname === "/projects" ||
    pathname === "/campaigns" ||
    pathname === "/events" ||
    pathname === "/archive" ||
    pathname === "/team" ||
    pathname === "/membership"
  )
    return true;

  if (/^\/projects\/[^/]+$/.test(pathname)) return true;
  if (/^\/campaigns\/[^/]+$/.test(pathname)) return true;
  if (/^\/events\/[^/]+$/.test(pathname)) return true;
  if (/^\/archive\/[^/]+$/.test(pathname)) return true;

  return false;
}

export function isHouseWorkspacePath(pathname: string) {
  if (isImmersiveHousePath(pathname)) return false;

  if (
    pathname === "/app" ||
    pathname === "/members" ||
    pathname === "/connections" ||
    pathname === "/notifications" ||
    pathname === "/profile-card" ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/admin") ||
    pathname === "/projects/new" ||
    pathname === "/projects/manage" ||
    pathname === "/events/manage" ||
    pathname === "/events/new"
  )
    return true;

  if (/^\/projects\/[^/]+\/(edit|needs|opportunity|diligence)/.test(pathname))
    return true;
  if (/^\/projects\/[^/]+\/campaigns\/new/.test(pathname)) return true;
  if (/^\/events\/[^/]+\/edit/.test(pathname)) return true;
  if (/^\/campaigns\/[^/]+\/(work|settlement)/.test(pathname)) return true;

  return false;
}

function isActive(pathname: string, hash: string, item: WorkspaceItem) {
  const [path, itemHash] = item.href.split("#");
  if (itemHash) return pathname === path && hash === `#${itemHash}`;
  if (item.exact) return pathname === path && hash === "";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function SidebarLink({
  item,
  pathname,
  hash,
}: {
  item: WorkspaceItem;
  pathname: string;
  hash: string;
}) {
  const active = isActive(pathname, hash, item);
  return (
    <Link
      className={`house-workspace-sidebar-link${active ? " is-active" : ""}`}
      to={item.href}
      aria-label={`${item.label}, workspace navigation`}
      aria-current={active ? "page" : undefined}
    >
      <span className="house-workspace-sidebar-glyph" aria-hidden="true">
        {item.glyph}
      </span>
      <span aria-hidden="true">{item.label}</span>
    </Link>
  );
}

export function HouseWorkspaceSidebar({
  user,
  pathname,
  hash = "",
}: {
  user: SessionUser;
  pathname: string;
  hash?: string;
}) {
  const adminMode = pathname.startsWith("/admin");
  const adminItems = user.adminAccess
    ? visibleAdminWorkspaceItems(user.adminAccess)
    : [];
  const roleItems = workspaceRoleItems(user);
  const roleHrefs = new Set(roleItems.map((item) => item.href));
  const remainingDiscoveryItems = discoveryItems.filter(
    (item) => !roleHrefs.has(item.href),
  );

  return (
    <aside className="house-workspace-sidebar" aria-label="AKARI workspace">
      <Link
        className="house-workspace-sidebar-brand"
        to="/"
        aria-label="AKARI House home"
      >
        <img
          src="/assets/optimized/akari-logo.webp"
          alt="AKARI"
          width={360}
          height={117}
        />
        <span>{adminMode ? "Admin House" : "House"}</span>
      </Link>

      <nav aria-label="House navigation">
        <span className="house-workspace-sidebar-section">Your House</span>
        <SidebarLink
          item={houseHomeItem}
          pathname={pathname}
          hash={hash}
        />

        {roleItems.length > 0 && (
          <>
            <span className="house-workspace-sidebar-section">
              Start with your role
            </span>
            {roleItems.map((item) => (
              <SidebarLink
                key={item.label}
                item={item}
                pathname={pathname}
                hash={hash}
              />
            ))}
          </>
        )}

        <span className="house-workspace-sidebar-section">
          Network & discovery
        </span>
        {remainingDiscoveryItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            pathname={pathname}
            hash={hash}
          />
        ))}

        <span className="house-workspace-sidebar-section">
          Profile & settings
        </span>
        {profileItems.map((item) => (
          <SidebarLink
            key={item.label}
            item={item}
            pathname={pathname}
            hash={hash}
          />
        ))}

        {user.adminAccess && (
          <>
            <span className="house-workspace-sidebar-section">
              {user.adminAccess.accessLevel === "superadmin"
                ? "Superadmin"
                : "Administration"}
            </span>
            <SidebarLink
              item={{
                label: "Admin overview",
                href: "/admin",
                glyph: "◆",
                exact: true,
              }}
              pathname={pathname}
              hash={hash}
            />
            {adminItems.map((item) => (
              <SidebarLink
                key={item.key}
                item={{ label: item.label, href: item.to, glyph: "·" }}
                pathname={pathname}
                hash={hash}
              />
            ))}
          </>
        )}
      </nav>

      <div className="house-workspace-sidebar-footer">
        <div className="house-workspace-member">
          <span aria-hidden="true">
            {user.displayName.trim().charAt(0).toUpperCase() || "A"}
          </span>
          <div>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </div>
        </div>
        <Form method="post" action="/logout">
          <button type="submit">Log out</button>
        </Form>
      </div>
    </aside>
  );
}
