import { Link } from "react-router";
import type { SessionUser } from "~/lib/domain";

type WorkspaceAction = {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
};

export function dashboardRoleActions(user: SessionUser): WorkspaceAction[] {
  if (user.accessTier === "applicant") {
    return [
      {
        eyebrow: "Your introduction",
        title: "Continue your profile",
        description:
          "Keep your roles, biography and interests current while your request is reviewed.",
        to: "/app#profile-editor",
      },
      {
        eyebrow: "Explore the House",
        title: "Discover projects",
        description:
          "See the public founder projects already gathering collaborators.",
        to: "/projects",
      },
      {
        eyebrow: "Upcoming gatherings",
        title: "Explore events",
        description:
          "Read the invitations currently open across the AKARI community.",
        to: "/events",
      },
    ];
  }

  const actions: WorkspaceAction[] = [];
  if (user.roles.includes("founder")) {
    actions.push({
      eyebrow: "Founder workspace",
      title: "Manage your projects",
      description:
        "Create, refine and review the project lanterns connected to your profile.",
      to: "/projects/manage",
    });
  }
  if (user.roles.includes("creator")) {
    actions.push({
      eyebrow: "Creator workspace",
      title: "Find projects to follow",
      description:
        "Discover founder work seeking thoughtful creative collaborators.",
      to: "/projects",
    });
  }
  if (user.roles.includes("investor")) {
    actions.push({
      eyebrow: "Investor workspace",
      title: "Review opportunities",
      description:
        "Explore published projects and open a considered conversation.",
      to: "/projects",
    });
  }

  actions.push(
    {
      eyebrow: "Member directory",
      title: "Meet people in the House",
      description:
        "Find members by role, expertise or location without exposing private profiles.",
      to: "/members",
    },
    {
      eyebrow: "Your network",
      title: "Continue connections",
      description:
        "Review mutual connections and respond to requests waiting for you.",
      to: "/connections",
    },
    {
      eyebrow: "Gatherings",
      title: "See upcoming events",
      description:
        "Reserve a place at approved online and in-person gatherings.",
      to: "/events",
    },
  );

  return actions;
}

export function DashboardRoleActions({ user }: { user: SessionUser }) {
  const actions = dashboardRoleActions(user);

  return (
    <div className="dashboard-role-actions">
      {actions.map((action) => (
        <Link className="dashboard-role-card" to={action.to} key={action.title}>
          <span>{action.eyebrow}</span>
          <strong>{action.title}</strong>
          <p>{action.description}</p>
          <small>Open workspace</small>
        </Link>
      ))}
    </div>
  );
}
