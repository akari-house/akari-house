import { roles, type Role, type Visibility } from "./domain";

export interface MemberDirectoryFilters {
  query: string;
  role: Role | "";
  location: string;
  expertise: string;
}

export interface DirectoryFilterMember {
  displayName: string;
  username: string;
  headline: string;
  bio: string;
  expertise: string;
  location: string;
  roles: readonly Role[];
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
) {
  if (visibility === "public") return true;
  if (accessTier === "applicant") return false;
  return visibility === "members" || visibility === "connections";
}

export function canAccessDirectoryProfile(
  visibility: Visibility,
  accessTier: "applicant" | "member",
  isConnected: boolean,
) {
  if (visibility === "public") return true;
  if (accessTier === "applicant") return false;
  if (visibility === "members") return true;
  return visibility === "connections" && isConnected;
}

function includesFolded(value: string, query: string) {
  return value.toLocaleLowerCase("en").includes(query.toLocaleLowerCase("en"));
}

export function memberMatchesDirectoryFilters(
  member: DirectoryFilterMember,
  filters: MemberDirectoryFilters,
) {
  if (filters.role && !member.roles.includes(filters.role)) return false;
  if (filters.location && !includesFolded(member.location, filters.location))
    return false;
  if (filters.expertise && !includesFolded(member.expertise, filters.expertise))
    return false;
  if (!filters.query) return true;
  return [
    member.displayName,
    member.username,
    member.headline,
    member.bio,
    member.expertise,
  ].some((value) => includesFolded(value, filters.query));
}
