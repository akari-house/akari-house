export type ActivationRole = "founder" | "creator" | "investor";

export type ActivationAction = {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  priority: number;
  role?: ActivationRole | "account" | "network";
};

export type MemberActivationSnapshot = {
  accessTier: "applicant" | "member";
  roles: ActivationRole[];
  profilePercent: number;
  profileMissing: string[];
  founderProjectCount: number;
  founderDraftProjectCount: number;
  founderPublishedProjectCount: number;
  founderPendingClaimCount: number;
  founderOutcomeActivationCount: number;
  xProfileUrl: string;
  xFollowerCount: number | null;
  xScore: number | null;
  sorsaScore: number | null;
  creatorApplicationCount: number;
  creatorAcceptedCampaignCount: number;
  investorProfileStatus: string | null;
  investorPreferencesComplete: boolean;
  investorInterestCount: number;
  investorProgressedCount: number;
  unreadNotifications: number;
  pendingConnections: number;
};

function addUnique(actions: ActivationAction[], action: ActivationAction) {
  if (!actions.some((candidate) => candidate.key === action.key))
    actions.push(action);
}

export function buildMemberNextActions(snapshot: MemberActivationSnapshot) {
  const actions: ActivationAction[] = [];

  if (snapshot.accessTier === "applicant") {
    if (snapshot.profilePercent < 100) {
      addUnique(actions, {
        key: "applicant-profile",
        eyebrow: "Membership preparation",
        title: "Continue your private profile",
        description: snapshot.profileMissing.length
          ? `Add ${snapshot.profileMissing.slice(0, 2).join(" and ")} while the Membership Desk reviews your application.`
          : "Keep your introduction current while the Membership Desk reviews your application.",
        to: "/app#profile-editor",
        actionLabel: "Continue profile",
        priority: 100,
        role: "account",
      });
    }
    addUnique(actions, {
      key: "applicant-projects",
      eyebrow: "Explore the House",
      title: "Discover Founder projects",
      description:
        "See the public projects already gathering collaborators and support.",
      to: "/projects",
      actionLabel: "Browse projects",
      priority: 40,
      role: "network",
    });
    addUnique(actions, {
      key: "applicant-events",
      eyebrow: "Upcoming gatherings",
      title: "Explore AKARI events",
      description:
        "Read the invitations currently open across the AKARI community.",
      to: "/events",
      actionLabel: "Browse events",
      priority: 30,
      role: "network",
    });
    return actions.sort((a, b) => b.priority - a.priority).slice(0, 4);
  }

  if (snapshot.profilePercent < 100) {
    addUnique(actions, {
      key: "profile-readiness",
      eyebrow: "Account readiness",
      title: "Complete your professional profile",
      description: snapshot.profileMissing.length
        ? `Add ${snapshot.profileMissing.slice(0, 2).join(" and ")} so trusted members can understand who you are.`
        : "Keep your profile current so trusted members can understand who you are.",
      to: "/app#profile-editor",
      actionLabel: "Complete profile",
      priority: 92,
      role: "account",
    });
  }

  if (snapshot.roles.includes("founder")) {
    if (snapshot.founderProjectCount === 0) {
      addUnique(actions, {
        key: "founder-first-project",
        eyebrow: "Founder next action",
        title: "Create your first Project",
        description:
          "Add the Project you are building so AKARI can connect your Founder identity to real work, needs and opportunities.",
        to: "/projects/new",
        actionLabel: "Create Project",
        priority: 110,
        role: "founder",
      });
    } else if (snapshot.founderPendingClaimCount > 0) {
      addUnique(actions, {
        key: "founder-project-claim",
        eyebrow: "Founder verification",
        title: "Track your Project relationship claim",
        description: `${snapshot.founderPendingClaimCount} Project relationship claim${snapshot.founderPendingClaimCount === 1 ? " is" : "s are"} waiting for AKARI review or updated evidence.`,
        to: "/projects/claim",
        actionLabel: "Open claim desk",
        priority: 100,
        role: "founder",
      });
    } else if (snapshot.founderDraftProjectCount > 0) {
      addUnique(actions, {
        key: "founder-draft-project",
        eyebrow: "Founder next action",
        title: "Finish your Project profile",
        description: `${snapshot.founderDraftProjectCount} Project${snapshot.founderDraftProjectCount === 1 ? " is" : "s are"} still in draft. Complete the strongest Project before creating more.`,
        to: "/projects/manage",
        actionLabel: "Continue Project",
        priority: 88,
        role: "founder",
      });
    } else if (
      snapshot.founderPublishedProjectCount > 0 &&
      snapshot.founderOutcomeActivationCount === 0
    ) {
      addUnique(actions, {
        key: "founder-activate-project",
        eyebrow: "Founder outcome",
        title: "Activate your published Project",
        description:
          "Your Project is published but has not entered an Ambassador Campaign or Investor opportunity workflow yet. Choose the next GTM or raise path.",
        to: "/projects/manage",
        actionLabel: "Activate Project",
        priority: 72,
        role: "founder",
      });
    } else {
      addUnique(actions, {
        key: "founder-project-needs",
        eyebrow: "Founder workspace",
        title: "Keep your Project needs current",
        description:
          "Review what your active Projects need now so Creators, Investors and AKARI operators see relevant requests.",
        to: "/projects/manage",
        actionLabel: "Review Projects",
        priority: 58,
        role: "founder",
      });
    }
  }

  if (snapshot.roles.includes("creator")) {
    const missingCreator: string[] = [];
    if (!snapshot.xProfileUrl) missingCreator.push("X profile");
    if (snapshot.xFollowerCount === null) missingCreator.push("follower count");
    if (snapshot.xScore === null) missingCreator.push("XScore");
    if (snapshot.sorsaScore === null) missingCreator.push("Sorsa score");

    if (missingCreator.length) {
      addUnique(actions, {
        key: "creator-readiness",
        eyebrow: "Creator next action",
        title: "Become campaign-ready",
        description: `Add ${missingCreator.slice(0, 3).join(", ")}${missingCreator.length > 3 ? " and the remaining Creator data" : ""}. AKARI does not apply a follower threshold here; this is a data-completeness requirement.`,
        to: "/app#creator-readiness",
        actionLabel: "Complete Creator data",
        priority: 105,
        role: "creator",
      });
    } else if (snapshot.creatorAcceptedCampaignCount > 0) {
      addUnique(actions, {
        key: "creator-campaign-status",
        eyebrow: "Creator outcome",
        title: "Continue your accepted campaign work",
        description: `${snapshot.creatorAcceptedCampaignCount} accepted campaign${snapshot.creatorAcceptedCampaignCount === 1 ? " is" : "s are"} active in your Creator workflow. Keep delivery and approval status current.`,
        to: "/campaigns",
        actionLabel: "Open campaign work",
        priority: 76,
        role: "creator",
      });
    } else if (snapshot.creatorApplicationCount > 0) {
      addUnique(actions, {
        key: "creator-campaign-status",
        eyebrow: "Creator outcome",
        title: "Track your campaign applications",
        description: `You have ${snapshot.creatorApplicationCount} campaign application${snapshot.creatorApplicationCount === 1 ? "" : "s"}. Review status before applying to more opportunities.`,
        to: "/campaigns",
        actionLabel: "Review applications",
        priority: 70,
        role: "creator",
      });
    } else {
      addUnique(actions, {
        key: "creator-campaigns",
        eyebrow: "Creator workspace",
        title: "Discover Ambassador Campaigns",
        description:
          "Your minimum Creator profile data is complete. Review open campaigns and participate where the fit is relevant.",
        to: "/campaigns",
        actionLabel: "Browse campaigns",
        priority: 64,
        role: "creator",
      });
    }
  }

  if (snapshot.roles.includes("investor")) {
    if (
      !snapshot.investorPreferencesComplete ||
      snapshot.investorProfileStatus === "claimed"
    ) {
      addUnique(actions, {
        key: "investor-preferences",
        eyebrow: "Investor next action",
        title: "Complete your investment preferences",
        description:
          "Add sectors, stages, regions, cheque range and eligibility context before reviewing matched opportunities.",
        to: "/settings/investor",
        actionLabel: "Set Investor preferences",
        priority: 103,
        role: "investor",
      });
    } else if (snapshot.investorProfileStatus === "profile_complete") {
      addUnique(actions, {
        key: "investor-verification",
        eyebrow: "Investor trust",
        title: "Submit your Investor profile for verification",
        description:
          "Your preferences are complete. Submit the professional context required for AKARI verification.",
        to: "/settings/investor",
        actionLabel: "Open Investor profile",
        priority: 82,
        role: "investor",
      });
    } else if (snapshot.investorProfileStatus === "verification_pending") {
      addUnique(actions, {
        key: "investor-review-pending",
        eyebrow: "Investor trust",
        title: "Your Investor verification is under review",
        description:
          "No action is required unless AKARI requests additional information. You can keep your preferences current meanwhile.",
        to: "/settings/investor",
        actionLabel: "Review profile",
        priority: 48,
        role: "investor",
      });
    } else if (snapshot.investorProgressedCount > 0) {
      addUnique(actions, {
        key: "investor-interest-status",
        eyebrow: "Investor outcome",
        title: "Continue your active Founder relationships",
        description: `${snapshot.investorProgressedCount} Investor relationship${snapshot.investorProgressedCount === 1 ? " has" : "s have"} progressed beyond initial interest. Continue the strongest conversations before widening the pipeline.`,
        to: "/deals",
        actionLabel: "Open active relationships",
        priority: 68,
        role: "investor",
      });
    } else if (snapshot.investorInterestCount > 0) {
      addUnique(actions, {
        key: "investor-interest-status",
        eyebrow: "Investor outcome",
        title: "Track your expressed Project interest",
        description: `You have ${snapshot.investorInterestCount} active interest or introduction signal${snapshot.investorInterestCount === 1 ? "" : "s"}. Review those before adding more opportunities.`,
        to: "/deals",
        actionLabel: "Review interest",
        priority: 66,
        role: "investor",
      });
    } else {
      addUnique(actions, {
        key: "investor-opportunities",
        eyebrow: "Investor workspace",
        title: "Review relevant opportunities",
        description:
          "Use your investment preferences to evaluate Founder Projects and opportunities inside the House.",
        to: "/deals",
        actionLabel: "Review opportunities",
        priority: 62,
        role: "investor",
      });
    }
  }

  if (snapshot.pendingConnections > 0) {
    addUnique(actions, {
      key: "pending-connections",
      eyebrow: "Your network",
      title: "Respond to connection requests",
      description: `${snapshot.pendingConnections} connection request${snapshot.pendingConnections === 1 ? " is" : "s are"} waiting for your decision.`,
      to: "/connections",
      actionLabel: "Review requests",
      priority: 78,
      role: "network",
    });
  }

  if (snapshot.unreadNotifications > 0) {
    addUnique(actions, {
      key: "unread-notifications",
      eyebrow: "House updates",
      title: "Review unread updates",
      description: `${snapshot.unreadNotifications} unread update${snapshot.unreadNotifications === 1 ? " is" : "s are"} waiting in your House inbox.`,
      to: "/notifications",
      actionLabel: "Open updates",
      priority: 52,
      role: "network",
    });
  }

  if (!actions.length) {
    addUnique(actions, {
      key: "discover-members",
      eyebrow: "Your network",
      title: "Discover relevant members",
      description:
        "Your essential setup is complete. Find Founders, Creators and Investors relevant to what you are doing now.",
      to: "/members",
      actionLabel: "Discover members",
      priority: 40,
      role: "network",
    });
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

export type AdminQueueSnapshot = {
  key: string;
  label: string;
  description: string;
  to: string;
  count: number;
};

const adminPriority: Record<string, number> = {
  membership: 110,
  verification: 105,
  "project-claims": 103,
  moderation: 100,
  projects: 92,
  campaigns: 88,
  contact: 80,
  operations: 75,
  production: 72,
  team: 20,
  directory: 18,
};

export function buildAdminNextAction(items: AdminQueueSnapshot[]) {
  const active = items
    .filter(
      (item) => item.count > 0 && !["team", "directory"].includes(item.key),
    )
    .sort(
      (a, b) => (adminPriority[b.key] ?? 50) - (adminPriority[a.key] ?? 50),
    );
  const next = active[0] ?? null;
  return {
    next,
    activeQueueCount: active.length,
    remainingItemCount: active.reduce((total, item) => total + item.count, 0),
  };
}
