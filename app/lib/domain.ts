export const roles = ["founder", "creator", "investor"] as const;
export type Role = (typeof roles)[number];

export const visibilities = ["public", "members", "connections", "private"] as const;
export type Visibility = (typeof visibilities)[number];

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  roles: Role[];
}

export interface ProfileRecord {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  location: string;
  visibility: Visibility;
  roles: Role[];
}
