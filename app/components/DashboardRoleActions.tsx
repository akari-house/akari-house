import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { SessionUser } from "~/lib/domain";
import type { ActivationAction } from "~/lib/activation-next-actions";

type WorkspaceAction = {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  actionLabel: string;
  key?: string;
  role?: ActivationAction["role"];
  priority?: number;
};

export function dashboardRoleActions(user: SessionUser): WorkspaceAction[] {
  if (user.accessTier === "applicant") {
    return [
      {
        eyebrow: "Your profile",
        title: "Complete your AKARI profile",
        description:
          "Add the professional context and social links you want to share. Your applicant profile stays private while your membership request is reviewed.",
        to: "/app",
        actionLabel: "Continue profile",
      },
      {
        eyebrow: "Projects",
        title: "Discover what members are building",
        description:
          "Browse published Founder projects and see where teams are looking for support.",
        to: "/projects",
        actionLabel: "Browse projects",
      },
      {
        eyebrow: "Events",
        title: "See what is happening in the House",
        description:
          "Explore approved online and in-person AKARI gatherings.",
        to: "/events",
        actionLabel: "Browse events",
      },
    ];
  }

  const actions: WorkspaceAction[] = [];
  if (user.roles.includes("founder")) {
    actions.push({
      eyebrow: "Founder",
      title: "Create or manage your projects",
      description:
        "One Founder account can manage multiple project profiles, update what each project needs and launch Creator campaigns.",
      to: "/projects/manage",
      actionLabel: "Manage projects",
    });
  }
  if (user.roles.includes("creator")) {
    actions.push({
      eyebrow: "Creator",
      title: "Find campaigns you can join",
      description:
        "Keep your X profile, follower count, XScore and Sorsa score current, then discover relevant Ambassador Campaigns.",
      to: "/campaigns",
      actionLabel: "Browse campaigns",
    });
  }
  if (user.roles.includes("investor")) {
    actions.push({
      eyebrow: "Investor",
      title: "Discover relevant opportunities",
      description:
        "Review Founder opportunities and use your Investor preferences to improve what AKARI brings into view.",
      to: "/deals",
      actionLabel: "Explore opportunities",
    });
  }

  actions.push(
    {
      eyebrow: "People",
      title: "Discover members",
      description:
        "Find Founders, Creators and Investors by role, expertise or optional shared location without exposing private profiles.",
      to: "/members",
      actionLabel: "Discover members",
    },
    {
      eyebrow: "Connections",
      title: "Build your AKARI network",
      description:
        "Review your connections and respond to requests waiting for you.",
      to: "/connections",
      actionLabel: "Open connections",
    },
    {
      eyebrow: "Events",
      title: "Join upcoming gatherings",
      description:
        "Reserve a place at approved online and in-person AKARI gatherings.",
      to: "/events",
      actionLabel: "Browse events",
    },
  );

  return actions;
}

function isActivationAction(value: unknown): value is ActivationAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.key === "string" &&
    typeof action.eyebrow === "string" &&
    typeof action.title === "string" &&
    typeof action.description === "string" &&
    typeof action.to === "string" &&
    typeof action.actionLabel === "string" &&
    typeof action.priority === "number"
  );
}

function activationActionsFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("actions" in payload)) {
    return [];
  }
  const candidate = payload.actions;
  return Array.isArray(candidate) ? candidate.filter(isActivationAction) : [];
}

function trackActivationClick(action: WorkspaceAction) {
  if (!action.key) return;
  void fetch("/api/activation/events", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: action.key,
      role: action.role ?? "",
      to: action.to,
    }),
  }).catch(() => undefined);
}

export function DashboardRoleActions({ user }: { user: SessionUser }) {
  const [actions, setActions] = useState<WorkspaceAction[]>(() =>
    dashboardRoleActions(user),
  );

  useEffect(() => {
    const controller = new AbortController();
    const fallbackActions = dashboardRoleActions(user);
    void fetch("/api/activation/next-actions", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Activation actions unavailable");
        const payload: unknown = await response.json();
        return payload;
      })
      .then((payload) => {
        const next = activationActionsFromPayload(payload);
        if (next.length) setActions(next);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setActions(fallbackActions);
      });

    return () => controller.abort();
  }, [user]);

  return (
    <div className="dashboard-role-actions" aria-live="polite">
      {actions.map((action, index) => (
        <Link
          className={`dashboard-role-card${index === 0 ? " is-primary" : ""}`}
          to={action.to}
          key={`${action.eyebrow}:${action.title}`}
          onClick={() => trackActivationClick(action)}
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
