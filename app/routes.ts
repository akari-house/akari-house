import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("hall", "routes/hall.tsx"),
  route("rooms/:room", "routes/room.tsx"),
  route("archive", "routes/archive.tsx"),
  route("archive/:slug", "routes/case-study.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("membership/check-email", "routes/membership-check-email.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("admin/applications", "routes/admin-applications.tsx"),
  route("logout", "routes/logout.tsx"),
  route("app", "routes/dashboard.tsx"),
  route("profiles/:username", "routes/profile.tsx"),
] satisfies RouteConfig;
