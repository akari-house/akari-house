import type { Visibility } from "./domain";

export interface VisibilityContext {
  ownerId: string;
  viewerId: string | null;
  isConnected: boolean;
}

export function canViewProfile(
  visibility: Visibility,
  context: VisibilityContext,
) {
  if (context.viewerId === context.ownerId) return true;
  if (visibility === "public") return true;
  if (visibility === "members") return context.viewerId !== null;
  if (visibility === "connections")
    return context.viewerId !== null && context.isConnected;
  return false;
}
