import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("hall", "routes/hall.tsx"),
  route("rooms/:room", "routes/room.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("logout", "routes/logout.tsx"),
  route("app", "routes/dashboard.tsx"),
  route("profiles/:username", "routes/profile.tsx"),
] satisfies RouteConfig;
