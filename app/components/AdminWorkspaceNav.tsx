import { NavLink } from "react-router";
import {
  crmProductBoundary,
  visibleAdminWorkspaceItems,
  type AdminWorkspaceAccess,
} from "~/lib/admin-workspace";

export function AdminWorkspaceNav({
  access,
}: {
  access: AdminWorkspaceAccess;
}) {
  const items = visibleAdminWorkspaceItems(access);
  return (
    <nav className="admin-workspace-nav" aria-label="Admin workspace">
      <NavLink to="/admin" end>
        Overview
      </NavLink>
      {access.accessLevel === "superadmin" && (
        <a href={crmProductBoundary.url} target="_blank" rel="noreferrer">
          {crmProductBoundary.label} ↗
        </a>
      )}
      {items.map((item) => (
        <NavLink key={item.key} to={item.to}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
