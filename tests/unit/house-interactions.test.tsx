// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { HouseHall } from "~/components/house/HouseHall";
import { BlossomJourney } from "~/components/house/BlossomJourney";
import {
  HouseWorkspaceSidebar,
  workspaceRoleItems,
} from "~/components/HouseWorkspaceSidebar";
import { SiteHeader } from "~/components/SiteHeader";
import type { SessionUser } from "~/lib/domain";

afterEach(cleanup);

function withRouter(element: React.ReactNode, initialEntry = "/") {
  return render(
    <RouterProvider
      router={createMemoryRouter([{ path: "*", element }], {
        initialEntries: [initialEntry],
      })}
    />,
  );
}

function memberWithRoles(roles: SessionUser["roles"]): SessionUser {
  return {
    id: "member-1",
    username: "member",
    displayName: "AKARI Member",
    accessTier: "member",
    roles,
  };
}

describe("house interactions", () => {
  it("moves the Blossom Journey through accessible outcomes", async () => {
    const user = userEvent.setup();
    withRouter(<BlossomJourney />);
    const entrance = screen.getByRole("tab", { name: /Entrance/ });
    entrance.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Strategy Room/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Turn a broad ambition/)).toBeVisible();
  });

  it("renders progress only in the spaces between Journey nodes", async () => {
    const user = userEvent.setup();
    const { container } = withRouter(<BlossomJourney />);
    const connectors = container.querySelectorAll(".journey-connector");

    expect(connectors).toHaveLength(4);
    expect(
      container.querySelectorAll(".journey-connector.is-complete"),
    ).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: /Common Table/ }));
    expect(
      container.querySelectorAll(".journey-connector.is-complete"),
    ).toHaveLength(3);
  });

  it("prioritises the real first task for Creators and Investors", () => {
    expect(workspaceRoleItems(memberWithRoles(["creator"]))[0]).toMatchObject({
      label: "Find campaigns",
      href: "/campaigns",
    });
    expect(workspaceRoleItems(memberWithRoles(["investor"]))[0]).toMatchObject({
      label: "Explore matched Deals",
      href: "/deals",
    });
  });

  it("deduplicates overlapping destinations for multi-role members", () => {
    const items = workspaceRoleItems(
      memberWithRoles(["founder", "creator", "investor"]),
    );
    const destinations = items.map((item) => item.href);

    expect(destinations.filter((href) => href === "/campaigns")).toHaveLength(1);
    expect(destinations.filter((href) => href === "/deals")).toHaveLength(1);
    expect(destinations[0]).toBe("/projects/manage");
  });

  it("places role tasks before general network discovery", () => {
    const { container } = withRouter(
      <HouseWorkspaceSidebar
        user={memberWithRoles(["creator"])}
        pathname="/app"
      />,
      "/app",
    );
    const sections = [
      ...container.querySelectorAll(".house-workspace-sidebar-section"),
    ].map((section) => section.textContent);

    expect(sections.indexOf("Start with your role")).toBeLessThan(
      sections.indexOf("Network & discovery"),
    );
    expect(
      screen.getByRole("link", { name: "Find campaigns, workspace navigation" }),
    ).toHaveAttribute("href", "/campaigns");
  });

  it("previews rooms before exposing one dedicated entry link", async () => {
    const user = userEvent.setup();
    withRouter(<HouseHall />);
    expect(screen.getByRole("link", { name: /Enter room/ })).toHaveAttribute(
      "href",
      "/rooms/strategy",
    );
    await user.click(
      screen.getByRole("button", { name: "Preview Creator Studio" }),
    );
    expect(screen.getByRole("link", { name: /Enter room/ })).toHaveAttribute(
      "href",
      "/rooms/creator",
    );
  });

  it("moves the Hall focus toward the room being explored", async () => {
    const user = userEvent.setup();
    const { container } = withRouter(<HouseHall />);
    await user.click(
      screen.getByRole("button", { name: "Preview Creator Studio" }),
    );
    expect(container.querySelector(".hall-stage")).toHaveAttribute(
      "data-active-room",
      "creator",
    );
  });

  it("supports arrow-key navigation across Hall tabs", async () => {
    const user = userEvent.setup();
    withRouter(<HouseHall />);
    const strategy = screen.getByRole("tab", { name: /Strategy Room/ });
    strategy.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Creator Studio/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("link", { name: /Enter room/ })).toHaveAttribute(
      "href",
      "/rooms/creator",
    );
  });

  it("locks body scroll while mobile navigation is open", async () => {
    const user = userEvent.setup();
    withRouter(<SiteHeader user={null} />);
    const menu = screen.getByRole("button", { name: "Open navigation" });
    await waitFor(() => expect(menu).toBeEnabled());
    await user.click(menu);
    expect(document.body.style.overflow).toBe("hidden");
    expect(
      screen.getByRole("dialog", { name: "Site navigation" }),
    ).toHaveAttribute("aria-modal", "true");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveFocus();
  });

  it("makes page content inert and removes Journey Back while the drawer is open", async () => {
    const user = userEvent.setup();
    withRouter(
      <>
        <SiteHeader user={null} />
        <main id="main-content">Page content</main>
      </>,
      "/projects/example",
    );

    expect(
      screen.getByRole("link", { name: "Back to projects" }),
    ).toBeVisible();
    const menu = screen.getByRole("button", { name: "Open navigation" });
    await waitFor(() => expect(menu).toBeEnabled());
    await user.click(menu);

    expect(document.getElementById("main-content")?.inert).toBe(true);
    expect(
      screen.queryByRole("link", { name: "Back to projects" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close menu" }));
    expect(document.getElementById("main-content")?.inert).not.toBe(true);
    expect(
      screen.getByRole("link", { name: "Back to projects" }),
    ).toHaveAttribute("href", "/projects");
  });

  it("exposes authenticated destinations in mobile navigation", async () => {
    const user = userEvent.setup();
    withRouter(
      <SiteHeader user={memberWithRoles(["founder"])} />,
      "/connections",
    );
    const menu = screen.getByRole("button", { name: "Open navigation" });
    await waitFor(() => expect(menu).toBeEnabled());
    await user.click(menu);
    expect(
      screen.getByRole("navigation", { name: "Your AKARI account" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "My projects" })).toHaveAttribute(
      "href",
      "/projects/manage",
    );
    expect(screen.getByRole("link", { name: "Connections" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute(
      "href",
      "/settings/telegram",
    );
  });
});
