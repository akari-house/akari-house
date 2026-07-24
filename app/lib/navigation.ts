export function fallbackPath(pathname: string) {
  if (pathname.startsWith("/profiles/")) return "/members";
  if (pathname.startsWith("/projects/")) return "/projects";
  if (pathname.startsWith("/events/")) return "/events";
  if (pathname.startsWith("/archive/")) return "/archive";
  if (pathname.startsWith("/rooms/") || pathname === "/hall") return "/";
  if (
    pathname.startsWith("/connections") ||
    pathname.startsWith("/members") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/admin/")
  )
    return "/app";
  if (
    pathname === "/projects" ||
    pathname === "/events" ||
    pathname === "/archive"
  )
    return "/";
  return "/";
}

export function fallbackLabel(pathname: string) {
  if (pathname.startsWith("/profiles/")) return "Back to members";
  if (pathname.startsWith("/projects/")) return "Back to projects";
  if (pathname.startsWith("/events/")) return "Back to events";
  if (pathname.startsWith("/archive/")) return "Back to the Archive";
  if (pathname.startsWith("/rooms/") || pathname === "/hall")
    return "Back to the House";
  if (
    pathname.startsWith("/connections") ||
    pathname.startsWith("/members") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/admin/")
  )
    return "Back to your House";
  return "Back to the House";
}
