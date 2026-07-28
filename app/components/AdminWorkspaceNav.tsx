import { NavLink } from "react-router";
import {
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
      {items.map((item) => (
        <NavLink key={item.key} to={item.to}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
