// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import {
  DashboardRoleActions,
  dashboardRoleActions,
} from "~/components/DashboardRoleActions";
import { ProfileAvatar } from "~/components/ProfileAvatar";
import type { SessionUser } from "~/lib/domain";

afterEach(cleanup);

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-1",
    username: "akari-member",
    displayName: "Akari Member",
    accessTier: "member",
    roles: ["founder"],
    ...overrides,
  };
}

function renderWithRouter(element: React.ReactNode) {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element }], {
        initialEntries: ["/app"],
      })}
    />,
  );
}

describe("dashboard role actions", () => {
  it("links approved founders to real member and project workspaces", () => {
    renderWithRouter(<DashboardRoleActions user={user()} />);

    expect(
      screen.getByRole("link", { name: /manage your founder work/i }),
    ).toHaveAttribute("href", "/projects/manage");
    expect(
      screen.getByRole("link", { name: /find people by role/i }),
    ).toHaveAttribute("href", "/members");
    expect(
      screen.getByRole("link", { name: /continue connections/i }),
    ).toHaveAttribute("href", "/connections");
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it("takes Creators directly to campaign discovery", () => {
    const actions = dashboardRoleActions(user({ roles: ["creator"] }));
    expect(actions[0]).toMatchObject({
      eyebrow: "Creator workspace",
      title: "Find Creator campaigns",
      to: "/campaigns",
    });
  });

  it("takes Investors directly to matched Deals", () => {
    const actions = dashboardRoleActions(user({ roles: ["investor"] }));
    expect(actions[0]).toMatchObject({
      eyebrow: "Investor workspace",
      title: "Review matched Deals",
      to: "/deals",
    });
  });

  it("keeps each selected role distinct for multi-role members", () => {
    const actions = dashboardRoleActions(
      user({ roles: ["founder", "creator", "investor"] }),
    );
    expect(actions.slice(0, 3).map((action) => action.to)).toEqual([
      "/projects/manage",
      "/campaigns",
      "/deals",
    ]);
  });

  it("keeps applicant actions within currently available routes", () => {
    const actions = dashboardRoleActions(
      user({ accessTier: "applicant", roles: ["creator"] }),
    );

    expect(actions.map((action) => action.to)).toEqual([
      "/app",
      "/projects",
      "/events",
    ]);
  });
});

describe("profile avatar", () => {
  it("uses the compact card geometry for member directory photos", () => {
    const { container } = render(
      <ProfileAvatar
        displayName="Mina Sato"
        src="/media/profile/mina"
        variant="card"
      />,
    );

    const photo = container.querySelector("img");
    expect(photo).not.toBeNull();
    expect(photo!).toHaveClass("member-card-photo");
    expect(photo!).toHaveAttribute("width", "58");
    expect(photo!).toHaveAttribute("height", "58");
    expect(photo!).toHaveAttribute("alt", "");
  });

  it("uses the same public identity frame for photo and fallback", () => {
    const { rerender } = render(
      <ProfileAvatar displayName="Mina Sato" variant="profile" />,
    );
    expect(document.querySelector(".profile-monogram")).toHaveTextContent("M");

    rerender(
      <ProfileAvatar
        displayName="Mina Sato"
        src="/media/profile/mina"
        variant="profile"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Mina Sato's profile" }),
    ).toHaveClass("profile-photo");
  });
});
