import { Link } from "react-router";
import type { SessionUser } from "~/lib/domain";

type WorkspaceAction = {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
};

export function dashboardRoleActions(user: SessionUser): WorkspaceAction[] {
  if (user.accessTier === "applicant") {
    return [
      {
        eyebrow: "Your introduction",
        title: "Continue your profile",
        description:
          "Keep your roles, biography and interests current while your request is reviewed.",
        to: "/app",
        actionLabel: "Continue profile",
      },
      {
        eyebrow: "Explore the House",
        title: "Discover projects",
        description:
          "See the public Founder projects already gathering collaborators.",
        to: "/projects",
        actionLabel: "Browse projects",
      },
      {
        eyebrow: "Upcoming gatherings",
        title: "Explore events",
        description:
          "Read the invitations currently open across the AKARI community.",
        to: "/events",
        actionLabel: "Browse events",
      },
    ];
  }

  const actions: WorkspaceAction[] = [];
  if (user.roles.includes("founder")) {
    actions.push({
      eyebrow: "Founder workspace",
      title: "Manage your Founder work",
      description:
        "Keep project readiness, support needs, campaigns and investor-facing information in one place.",
      to: "/projects/manage",
      actionLabel: "Open Founder workspace",
    });
  }
  if (user.roles.includes("creator")) {
    actions.push({
      eyebrow: "Creator workspace",
      title: "Find Creator campaigns",
      description:
        "Review eligibility, apply to relevant campaigns and return to active deliverables and deadlines.",
      to: "/campaigns",
      actionLabel: "Browse campaigns",
    });
  }
  if (user.roles.includes("investor")) {
    actions.push({
      eyebrow: "Investor workspace",
      title: "Review matched Deals",
      description:
        "Open recommended opportunities, saved Deals, access requests and granted Deal Rooms.",
      to: "/deals",
      actionLabel: "Open Investor House",
    });
  }

  actions.push(
    {
      eyebrow: "Member directory",
      title: "Find people by role",
      description:
        "Discover Founders, Creators and Investors by role, expertise or location without exposing private profiles.",
      to: "/members",
      actionLabel: "Discover members",
    },
    {
      eyebrow: "Your network",
      title: "Continue connections",
      description:
        "Review mutual connections and respond to requests waiting for you.",
      to: "/connections",
      actionLabel: "Open connections",
    },
    {
      eyebrow: "Gatherings",
      title: "See upcoming events",
      description:
        "Reserve a place at approved online and in-person gatherings.",
      to: "/events",
      actionLabel: "Browse events",
    },
  );

  return actions;
}

export function DashboardRoleActions({ user }: { user: SessionUser }) {
  const actions = dashboardRoleActions(user);

  return (
    <div className="dashboard-role-actions">
      {actions.map((action, index) => (
        <Link
          className={`dashboard-role-card${index === 0 ? " is-primary" : ""}`}
          to={action.to}
          key={action.title}
        >
          <span>{action.eyebrow}</span>
          <strong>{action.title}</strong>
          <p>{action.description}</p>
          <small>{action.actionLabel}</small>
        </Link>
      ))}
    </div>
  );
}
