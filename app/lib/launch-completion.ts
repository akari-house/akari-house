export const pilotTaskDefinitions = [
  { key: "membership_auth", label: "Membership, login and session journey" },
  { key: "profile_privacy", label: "Profile completion and privacy controls" },
  { key: "connections", label: "Member discovery and connection journey" },
  { key: "founder_project", label: "Founder Project creation and activation" },
  {
    key: "creator_campaign",
    label: "Creator campaign application and delivery",
  },
  { key: "investor_deal", label: "Investor Deal discovery and diligence" },
  { key: "event_participation", label: "Event discovery and participation" },
  { key: "account_recovery", label: "Password reset, logout and recovery" },
] as const;

export type PilotTaskKey = (typeof pilotTaskDefinitions)[number]["key"];

export type LaunchCompletionSnapshot = {
  publishedProjects: number;
  publishedOpportunities: number;
  publishedCampaigns: number;
  upcomingEvents: number;
  approvedFounders: number;
  approvedCreators: number;
  approvedInvestors: number;
  multiRoleMembers: number;
  pilotParticipants: number;
  completedParticipants: number;
  pilotFounders: number;
  pilotCreators: number;
  pilotInvestors: number;
  pilotMultiRole: number;
  passedTaskKeys: string[];
  openCriticalOrHighFindings: number;
};

export type LaunchCompletionCheck = {
  key: string;
  label: string;
  current: number;
  target: number;
  passed: boolean;
};

function check(
  key: string,
  label: string,
  current: number,
  target: number,
): LaunchCompletionCheck {
  return { key, label, current, target, passed: current >= target };
}

export function evaluateLaunchCompletion(snapshot: LaunchCompletionSnapshot) {
  const seedChecks = [
    check(
      "projects",
      "Published Founder Projects",
      snapshot.publishedProjects,
      3,
    ),
    check(
      "opportunities",
      "Published Investor opportunities",
      snapshot.publishedOpportunities,
      2,
    ),
    check(
      "campaigns",
      "Published Creator campaigns",
      snapshot.publishedCampaigns,
      1,
    ),
    check("events", "Upcoming published events", snapshot.upcomingEvents, 2),
    check("founders", "Approved Founder members", snapshot.approvedFounders, 3),
    check("creators", "Approved Creator members", snapshot.approvedCreators, 8),
    check(
      "investors",
      "Approved Investor members",
      snapshot.approvedInvestors,
      3,
    ),
    check(
      "multi_role",
      "Approved multi-role members",
      snapshot.multiRoleMembers,
      1,
    ),
  ];

  const cohortChecks = [
    check(
      "participants",
      "Real pilot participants",
      snapshot.pilotParticipants,
      10,
    ),
    check(
      "completed_participants",
      "Participants completing the pilot",
      snapshot.completedParticipants,
      10,
    ),
    check(
      "pilot_founders",
      "Founder pilot coverage",
      snapshot.pilotFounders,
      3,
    ),
    check(
      "pilot_creators",
      "Creator pilot coverage",
      snapshot.pilotCreators,
      8,
    ),
    check(
      "pilot_investors",
      "Investor pilot coverage",
      snapshot.pilotInvestors,
      3,
    ),
    check(
      "pilot_multi_role",
      "Multi-role pilot coverage",
      snapshot.pilotMultiRole,
      1,
    ),
  ];

  const requiredJourneyKeys: PilotTaskKey[] = [
    "membership_auth",
    "profile_privacy",
    "founder_project",
    "creator_campaign",
    "investor_deal",
    "account_recovery",
  ];
  const passedTasks = new Set(snapshot.passedTaskKeys);
  const journeyChecks = requiredJourneyKeys.map((key) => ({
    key,
    label:
      pilotTaskDefinitions.find((definition) => definition.key === key)
        ?.label ?? key,
    passed: passedTasks.has(key),
  }));

  const seedReady = seedChecks.every((item) => item.passed);
  const cohortReady = cohortChecks.every((item) => item.passed);
  const journeysReady = journeyChecks.every((item) => item.passed);
  const defectsClear = snapshot.openCriticalOrHighFindings === 0;
  const readyForPublicV1 =
    seedReady && cohortReady && journeysReady && defectsClear;

  return {
    seedChecks,
    cohortChecks,
    journeyChecks,
    seedReady,
    cohortReady,
    journeysReady,
    defectsClear,
    readyForPublicV1,
  };
}
