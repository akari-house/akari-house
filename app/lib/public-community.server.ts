import type { Role } from "./domain";

export type PublicCommunityMember = {
  username: string;
  displayName: string;
  hasAvatar: boolean;
};

export type PublicCommunityGroup = {
  role: Role;
  label: string;
  total: number;
  members: PublicCommunityMember[];
};

const labels: Record<Role, string> = {
  founder: "Approved Founders",
  creator: "Verified Creators",
  investor: "Verified Investors and Angels",
};

export async function loadPublicCommunityProof(
  db: D1Database,
): Promise<PublicCommunityGroup[]> {
  const groups = await Promise.all(
    (["creator", "founder", "investor"] as const).map(async (role) => {
      const investorClause =
        role === "investor"
          ? `AND EXISTS (
               SELECT 1 FROM investor_profiles ip
               WHERE ip.user_id = u.id AND ip.status = 'verified'
             )`
          : "";
      const common = `FROM users u
        JOIN profiles p ON p.user_id = u.id
        JOIN profile_visibility pv ON pv.user_id = u.id
        JOIN membership_applications ma ON ma.user_id = u.id
        JOIN user_roles ur ON ur.user_id = u.id AND ur.role = ?
        JOIN role_verifications rv
          ON rv.user_id = u.id AND rv.role = ur.role
        WHERE u.status = 'active'
          AND ma.status = 'approved'
          AND pv.visibility = 'public'
          AND rv.status = 'verified'
          ${investorClause}`;
      const [count, members] = await Promise.all([
        db
          .prepare(`SELECT COUNT(DISTINCT u.id) AS total ${common}`)
          .bind(role)
          .first<{ total: number }>(),
        db
          .prepare(
            `SELECT u.username, p.display_name AS displayName,
                    CASE WHEN p.avatar_key IS NULL OR p.avatar_key = ''
                      THEN 0 ELSE 1 END AS hasAvatar
             ${common}
             ORDER BY CASE WHEN p.avatar_key IS NULL OR p.avatar_key = ''
                        THEN 1 ELSE 0 END,
                      p.updated_at DESC
             LIMIT 8`,
          )
          .bind(role)
          .all<{
            username: string;
            displayName: string;
            hasAvatar: number;
          }>(),
      ]);
      return {
        role,
        label: labels[role],
        total: Number(count?.total ?? 0),
        members: members.results.map((member) => ({
          username: member.username,
          displayName: member.displayName,
          hasAvatar: Boolean(member.hasAvatar),
        })),
      };
    }),
  );
  return groups;
}
