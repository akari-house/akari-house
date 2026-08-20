import { useState } from "react";
import { Link } from "react-router";
import type { Role, SessionUser } from "~/lib/domain";

type WorkspaceAction = {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
};

const roleJourneys: Record<Role, WorkspaceAction[]> = {
  founder: [
    {
      eyebrow: "01 · Project",
      title: "Keep your project actionable",
      description:
        "Make the project, stage and current support needs clear before asking the House to act.",
      to: "/projects/manage",
      actionLabel: "Manage projects",
    },
    {
      eyebrow: "02 · People",
      title: "Find the right Creators",
      description:
        "Discover people by role and expertise instead of broadcasting to everyone.",
      to: "/members?role=creator",
      actionLabel: "Find Creators",
    },
    {
      eyebrow: "03 · Momentum",
      title: "Turn support into a campaign",
      description:
        "Use published campaigns to coordinate clear briefs, applications and outcomes.",
      to: "/campaigns",
      actionLabel: "Open campaigns",
    },
  ],
  creator: [
    {
      eyebrow: "01 · Signal",
      title: "Make your profile useful",
      description:
        "Keep your X profile, follower count, XScore, Sorsa score, expertise and availability current.",
      to: "/app#profile-editor",
      actionLabel: "Update profile",
    },
    {
      eyebrow: "02 · Fit",
      title: "Find a campaign that fits",
      description:
        "Start with the brief, eligibility, deadline and compensation before you apply.",
      to: "/campaigns",
      actionLabel: "Find campaigns",
    },
    {
      eyebrow: "03 · Relationship",
      title: "Meet the people behind the work",
      description:
        "Build useful Founder relationships rather than collecting disconnected contacts.",
      to: "/members?role=founder",
      actionLabel: "Find Founders",
    },
  ],
  investor: [
    {
      eyebrow: "01 · Opportunity",
      title: "See opportunities first",
      description:
        "Review the available opportunity before spending time on settings or administration.",
      to: "/deals",
      actionLabel: "Browse opportunities",
    },
    {
      eyebrow: "02 · Relevance",
      title: "Tune what matters to you",
      description:
        "Preferences improve relevance without blocking your ability to browse the House.",
      to: "/settings/investor",
      actionLabel: "Set preferences",
    },
    {
      eyebrow: "03 · People",
      title: "Understand the Founder",
      description:
        "Use the member network to understand who is behind an opportunity before an introduction.",
      to: "/members?role=founder",
      actionLabel: "Find Founders",
    },
  ],
};

export function dashboardRoleActions(
  user: SessionUser,
  activeRole: Role = user.roles[0] ?? "founder",
): WorkspaceAction[] {
  if (user.accessTier === "applicant") {
    return [
      {
        eyebrow: "01 · Identity",
        title: "Complete your AKARI profile",
        description:
          "Keep your professional context and social links current. Your applicant profile stays private while membership is reviewed.",
        to: "/app#profile-editor",
        actionLabel: "Continue profile",
      },
      {
        eyebrow: "02 · Privacy",
        title: "Choose what you want to share",
        description:
          "Review your account and privacy choices before your member spaces open.",
        to: "/settings/account",
        actionLabel: "Review privacy",
      },
    ];
  }

  const safeRole = user.roles.includes(activeRole)
    ? activeRole
    : (user.roles[0] ?? "founder");
  return roleJourneys[safeRole];
}

export function DashboardRoleActions({ user }: { user: SessionUser }) {
  const roles = user.roles;
  const [activeRole, setActiveRole] = useState<Role>(roles[0] ?? "founder");
  const actions = dashboardRoleActions(user, activeRole);

  return (
    <div className="house-compass" aria-live="polite">
      <div className="house-compass-toolbar">
        {user.accessTier === "member" && roles.length > 1 && (
          <div
            className="house-compass-role-switch"
            aria-label="Choose your active AKARI role"
          >
            {roles.map((role) => (
              <button
                key={role}
                type="button"
                aria-pressed={activeRole === role}
                onClick={() => setActiveRole(role)}
              >
                {role}
              </button>
            ))}
          </div>
        )}
        <Link className="house-compass-profile-action" to="/app#profile-editor">
          Edit profile &amp; privacy <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="dashboard-role-actions house-compass-steps">
        {actions.map((action, index) => (
          <Link
            className={`dashboard-role-card house-compass-step${
              index === 0 ? " is-primary is-now" : ""
            }`}
            to={action.to}
            key={`${action.eyebrow}:${action.title}`}
          >
            <span>{action.eyebrow}</span>
            <strong>{action.title}</strong>
            <p>{action.description}</p>
            <small>
              {action.actionLabel} <span aria-hidden="true">→</span>
            </small>
          </Link>
        ))}
      </div>
    </div>
  );
}
