import { roles, type Role, type Visibility } from "./domain";

export interface MemberDirectoryFilters {
  query: string;
  role: Role | "";
  location: string;
  expertise: string;
}

function shortParam(value: string | null, maximum = 80) {
  return (value ?? "").trim().slice(0, maximum);
}

export function memberDirectoryFilters(url: URL): MemberDirectoryFilters {
  const requestedRole = shortParam(url.searchParams.get("role"), 20);
  return {
    query: shortParam(url.searchParams.get("q")),
    role: roles.includes(requestedRole as Role) ? (requestedRole as Role) : "",
    location: shortParam(url.searchParams.get("location")),
    expertise: shortParam(url.searchParams.get("expertise")),
  };
}

export function isDiscoverableProfile(
  visibility: Visibility,
  accessTier: "applicant" | "member",
  isConnected: boolean,
) {
  if (visibility === "public") return true;
  if (accessTier === "applicant") return false;
  if (visibility === "members") return true;
  return visibility === "connections" && isConnected;
}
