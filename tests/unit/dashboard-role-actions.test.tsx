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
  it("gives approved Founders one ordered project-to-people-to-campaign path", () => {
    renderWithRouter(<DashboardRoleActions user={user()} />);

    expect(
      screen.getByRole("link", { name: /keep your project actionable/i }),
    ).toHaveAttribute("href", "/projects/manage");
    expect(
      screen.getByRole("link", { name: /find the right creators/i }),
    ).toHaveAttribute("href", "/members?role=creator");
    expect(
      screen.getByRole("link", { name: /turn support into a campaign/i }),
    ).toHaveAttribute("href", "/campaigns");
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
  });

  it("keeps Creator readiness explicit before campaign discovery", () => {
    const actions = dashboardRoleActions(user({ roles: ["creator"] }));
    expect(actions[0]).toMatchObject({
      eyebrow: "01 · Signal",
      title: "Make your profile useful",
      to: "/app#profile-editor",
    });
    expect(actions[0].description).toContain("follower count");
    expect(actions[0].description).toContain("XScore");
    expect(actions[0].description).toContain("Sorsa");
    expect(actions[1]?.to).toBe("/campaigns");
  });

  it("takes Investors directly to opportunity discovery", () => {
    const actions = dashboardRoleActions(user({ roles: ["investor"] }));
    expect(actions[0]).toMatchObject({
      eyebrow: "01 · Opportunity",
      title: "See opportunities first",
      to: "/deals",
    });
    expect(actions[1]?.to).toBe("/settings/investor");
  });

  it("keeps each selected role distinct for multi-role members", () => {
    const multiRoleUser = user({ roles: ["founder", "creator", "investor"] });
    expect(dashboardRoleActions(multiRoleUser, "founder")[0]?.to).toBe(
      "/projects/manage",
    );
    expect(dashboardRoleActions(multiRoleUser, "creator")[0]?.to).toBe(
      "/app#profile-editor",
    );
    expect(dashboardRoleActions(multiRoleUser, "investor")[0]?.to).toBe(
      "/deals",
    );
  });

  it("keeps applicant actions inside profile and privacy preparation", () => {
    const actions = dashboardRoleActions(
      user({ accessTier: "applicant", roles: ["creator"] }),
    );

    expect(actions.map((action) => action.to)).toEqual([
      "/app#profile-editor",
      "/settings/account",
    ]);
    expect(actions[0].description).toContain("stays private");
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
