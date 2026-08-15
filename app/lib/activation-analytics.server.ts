import type {
  ActivationAction,
  MemberActivationSnapshot,
} from "~/lib/activation-next-actions";

export type ActivationMilestone = {
  key: string;
  role: "account" | "founder" | "creator" | "investor";
};

function creatorReady(snapshot: MemberActivationSnapshot) {
  return Boolean(
    snapshot.xProfileUrl &&
    snapshot.xFollowerCount !== null &&
    snapshot.xScore !== null &&
    snapshot.sorsaScore !== null,
  );
}

export function completedActivationMilestones(
  snapshot: MemberActivationSnapshot,
): ActivationMilestone[] {
  const milestones: ActivationMilestone[] = [];

  if (snapshot.profilePercent === 100) {
    milestones.push({ key: "profile-complete", role: "account" });
  }
  if (snapshot.roles.includes("founder") && snapshot.founderProjectCount > 0) {
    milestones.push({ key: "founder-first-project", role: "founder" });
  }
  if (snapshot.roles.includes("creator") && creatorReady(snapshot)) {
    milestones.push({ key: "creator-campaign-ready", role: "creator" });
  }
  if (
    snapshot.roles.includes("investor") &&
    snapshot.investorPreferencesComplete
  ) {
    milestones.push({
      key: "investor-preferences-complete",
      role: "investor",
    });
  }

  return milestones;
}

export async function recordActivationShown(
  db: D1Database,
  userId: string,
  actions: ActivationAction[],
) {
  if (!actions.length) return;

  await db.batch(
    actions.map((action) =>
      db
        .prepare(
          `INSERT INTO activation_action_events
             (id, user_id, action_key, event_type, role, target_path)
           SELECT ?, ?, ?, 'shown', ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM activation_action_events
             WHERE user_id = ? AND action_key = ? AND event_type = 'shown'
               AND created_at >= datetime('now', '-1 hour')
           )`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          action.key,
          action.role ?? "",
          action.to,
          userId,
          action.key,
        ),
    ),
  );
}

export async function recordActivationClick(
  db: D1Database,
  userId: string,
  action: Pick<ActivationAction, "key" | "role" | "to">,
) {
  await db
    .prepare(
      `INSERT INTO activation_action_events
         (id, user_id, action_key, event_type, role, target_path)
       VALUES (?, ?, ?, 'clicked', ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, action.key, action.role ?? "", action.to)
    .run();
}

export async function syncActivationMilestones(
  db: D1Database,
  userId: string,
  snapshot: MemberActivationSnapshot,
) {
  const milestones = completedActivationMilestones(snapshot);
  if (!milestones.length) return;

  await db.batch(
    milestones.map((milestone) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO activation_milestones
             (user_id, milestone_key, role)
           VALUES (?, ?, ?)`,
        )
        .bind(userId, milestone.key, milestone.role),
    ),
  );
}
